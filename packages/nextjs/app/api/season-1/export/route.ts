import { NextResponse } from "next/server";
import {
  type ActivityExportRow,
  type ExclusionExportRow,
  type SeasonContractsManifest,
  type WalletSummaryRow,
  attachSettledBetCounts,
  buildActivityExport,
  buildExclusionExport,
  buildManifest,
  buildPointsMerkleInput,
  buildWalletSummary,
  toCSV,
} from "~~/utils/bankrbets/seasonExport";
import { SEASON_1_CONFIG, type SeasonConfig, computeSeason } from "~~/utils/bankrbets/seasonPoints";
import { loadManualExclusions } from "~~/utils/bankrbets/server/manualExclusions";
import { fetchAllBetEvents, fetchRoundSettlements } from "~~/utils/bankrbets/server/seasonData";

export const maxDuration = 60;

const TYPES = ["manifest", "activity", "summary", "exclusions", "merkle-draft", "all"] as const;
type ExportType = (typeof TYPES)[number];

function getRuntimeConfig(): SeasonConfig {
  const start = process.env.SEASON_1_START_TS;
  const end = process.env.SEASON_1_END_TS;
  return {
    ...SEASON_1_CONFIG,
    startUnix: start ? Number(start) : SEASON_1_CONFIG.startUnix,
    endUnix: end ? Number(end) : SEASON_1_CONFIG.endUnix,
  };
}

// V1 = original prediction contract; V2 = current. Both share ABI and are indexed together.
const V1_PREDICTION_ADDRESS = "0xabadeb002247f2bd908eeedb32918aec304a0233";
const V2_PREDICTION_ADDRESS = "0x2cd785ba87e0841a8458141bc43d23a56a00557f";

function getContracts(): SeasonContractsManifest {
  return {
    v1Prediction: (process.env.SEASON_1_V1_ADDRESS ?? V1_PREDICTION_ADDRESS).toLowerCase(),
    v2Prediction: (process.env.SEASON_1_V2_ADDRESS ?? V2_PREDICTION_ADDRESS).toLowerCase(),
  };
}

function authorized(req: Request): boolean {
  const expected = process.env.SEASON_EXPORT_TOKEN;
  if (!expected) return process.env.NODE_ENV !== "production"; // dev-friendly fallback
  const url = new URL(req.url);
  const headerToken = req.headers.get("x-export-token");
  const queryToken = url.searchParams.get("token");
  return headerToken === expected || queryToken === expected;
}

const SUMMARY_COLUMNS: (keyof WalletSummaryRow)[] = [
  "seasonId",
  "wallet",
  "rank",
  "rawVolumeUSDCe6",
  "eligibleVolumeUSDCe6",
  "cappedVolumeUSDCe6",
  "settledBetCount",
  "excludedBetCount",
  "daysActive",
  "firstBetBonusEligible",
  "activityPointsE6",
  "bonusPointsE6",
  "totalPointsE6",
  "excluded",
  "exclusionCode",
];

const ACTIVITY_COLUMNS: (keyof ActivityExportRow)[] = [
  "seasonId",
  "user",
  "contractVersion",
  "contractAddress",
  "token",
  "epoch",
  "position",
  "amountUSDCe6",
  "eligibleAmountUSDCe6",
  "cappedAmountUSDCe6",
  "pointsEarnedE6",
  "roundStatus",
  "eligible",
  "exclusionCode",
  "exclusionReason",
  "unlocksFirstBet",
  "placedAt",
  "settledAt",
];

const EXCLUSION_COLUMNS: (keyof ExclusionExportRow)[] = [
  "seasonId",
  "wallet",
  "excluded",
  "exclusionCode",
  "exclusionReason",
  "notes",
  "reviewedBy",
  "reviewedAt",
];

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const typeParam = (url.searchParams.get("type") ?? "all") as ExportType;
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  // Final standings default — switch back to placed only via explicit ?windowMode=placed.
  const windowMode = url.searchParams.get("windowMode") === "placed" ? "placed" : "settled";

  if (!TYPES.includes(typeParam)) {
    return NextResponse.json({ error: `type must be one of ${TYPES.join(", ")}` }, { status: 400 });
  }

  const config = getRuntimeConfig();
  const contracts = getContracts();

  try {
    const events = await fetchAllBetEvents(config.startUnix, { unbounded: windowMode === "settled" });
    const roundIds = Array.from(new Set(events.map(e => e.roundId)));
    const roundData = await fetchRoundSettlements(roundIds);
    const { excluded, flagged } = await loadManualExclusions();

    const { walletPoints, activityByUser } = computeSeason(events, roundData, config, {
      flaggedWallets: flagged,
      excludedWallets: excluded,
      windowMode,
    });

    const sortedRanks = Array.from(walletPoints.values())
      .filter(w => w.reviewStatus !== "excluded" && (w.seasonPoints > 0 || w.eligibleVolumeUSD > 0))
      .sort((a, b) => {
        if (b.seasonPoints !== a.seasonPoints) return b.seasonPoints - a.seasonPoints;
        if (b.eligibleVolumeUSD !== a.eligibleVolumeUSD) return b.eligibleVolumeUSD - a.eligibleVolumeUSD;
        return a.user.localeCompare(b.user);
      });
    const rankByUser = new Map<string, number>();
    sortedRanks.forEach((entry, idx) => rankByUser.set(entry.user, idx + 1));

    const summaryRaw = buildWalletSummary(walletPoints, rankByUser, excluded);
    const summary = attachSettledBetCounts(summaryRaw, activityByUser);
    const activity = buildActivityExport(activityByUser);
    const exclusions = buildExclusionExport(excluded);
    const merkleDraft = buildPointsMerkleInput(summary);
    const manifest = buildManifest({
      config,
      walletPoints,
      excludedWallets: excluded,
      contracts,
      gitCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      ponderSnapshotAt: new Date().toISOString(),
      windowMode,
      refundedRoundsCount: true,
    });

    const filenameBase = `season-${manifest.seasonId}`;

    const respond = (artifact: ExportType) => {
      const json = (() => {
        switch (artifact) {
          case "manifest":
            return manifest;
          case "summary":
            return summary;
          case "activity":
            return activity;
          case "exclusions":
            return exclusions;
          case "merkle-draft":
            return merkleDraft;
          case "all":
            return {
              manifest,
              summary,
              activity,
              exclusions,
              merkleDraft,
            };
        }
      })();

      if (format === "csv") {
        const csv = (() => {
          switch (artifact) {
            case "summary":
              return toCSV(summary, SUMMARY_COLUMNS);
            case "activity":
              return toCSV(activity, ACTIVITY_COLUMNS);
            case "exclusions":
              return toCSV(exclusions, EXCLUSION_COLUMNS);
            default:
              return null;
          }
        })();
        if (csv === null) {
          return NextResponse.json(
            { error: "csv format only supported for summary | activity | exclusions" },
            { status: 400 },
          );
        }
        return new NextResponse(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filenameBase}-${artifact}.csv"`,
          },
        });
      }

      return NextResponse.json(json, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": artifact === "all" ? "inline" : `inline; filename="${filenameBase}-${artifact}.json"`,
        },
      });
    };

    return respond(typeParam);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "export failed" }, { status: 502 });
  }
}
