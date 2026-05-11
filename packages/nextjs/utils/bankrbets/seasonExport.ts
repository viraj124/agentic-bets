// Pure builders for the Season 1 export pipeline.
// All integer money / points fields are emitted as decimal strings so the
// Merkle input is stable across JSON parsers.
import {
  type BetActivityRow,
  EXCLUSION_LABELS,
  type ExclusionCode,
  type PublicSeasonConfig,
  type SeasonConfig,
  type WalletExclusionEntry,
  type WalletPoints,
  toPublicSeasonConfig,
} from "./seasonPoints";

export const SEASON_ID = 1;

export type SeasonContractsManifest = {
  v1Prediction?: string;
  v2Prediction?: string;
};

export type ExportRules = PublicSeasonConfig & {
  refundedRoundsCount: boolean;
  windowMode: "placed" | "settled";
};

export type SeasonManifest = {
  seasonId: number;
  startUnix: number;
  endUnix: number;
  generatedAt: string;
  gitCommit: string | null;
  ponderSnapshotAt: string | null;
  contracts: SeasonContractsManifest;
  rules: ExportRules;
  totals: {
    wallets: number;
    eligibleWallets: number;
    excludedWallets: number;
    totalRawVolumeUSDC: string;
    totalEligibleVolumeUSDC: string;
    totalCappedVolumeUSDC: string;
    totalPointsE6: string;
  };
};

export type WalletSummaryRow = {
  seasonId: number;
  wallet: string;
  rawVolumeUSDCe6: string;
  eligibleVolumeUSDCe6: string;
  cappedVolumeUSDCe6: string;
  settledBetCount: number;
  excludedBetCount: number;
  daysActive: number;
  firstBetBonusEligible: boolean;
  activityPointsE6: string;
  bonusPointsE6: string;
  totalPointsE6: string;
  rank: number | null;
  excluded: boolean;
  exclusionCode: ExclusionCode | null;
};

export type ActivityExportRow = BetActivityRow & {
  seasonId: number;
};

export type ExclusionExportRow = {
  seasonId: number;
  wallet: string;
  excluded: boolean;
  exclusionCode: ExclusionCode;
  exclusionReason: string;
  notes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
};

export type PointsMerkleEntry = {
  index: number;
  account: string;
  pointsE6: string;
  eligibleVolumeUSDCe6: string;
  rank: number;
};

export type PointsMerkleInput = {
  seasonId: number;
  type: "points_snapshot";
  rewardToken: null;
  rewardTokenAddress: null;
  totalPointsE6: string;
  entries: PointsMerkleEntry[];
};

export type RewardMerkleEntry = {
  index: number;
  account: string;
  amount: string; // wei string
  pointsE6: string;
};

export type RewardMerkleInput = {
  seasonId: number;
  type: "agbets_rewards";
  chainId: number;
  rewardToken: string;
  rewardTokenAddress: string;
  totalRewardAmount: string;
  entries: RewardMerkleEntry[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

const sumBigInt = (values: bigint[]) => values.reduce((acc, v) => acc + v, 0n);

const usdcToBigInt = (usd: number) => BigInt(Math.round(usd * 1_000_000));
const pointsToBigInt = (points: number) => BigInt(Math.round(points * 1_000_000));

// ── Wallet summary ─────────────────────────────────────────────────────────

export function buildWalletSummary(
  walletPoints: Map<string, WalletPoints>,
  rankByUser: Map<string, number>,
  excludedWallets: Map<string, WalletExclusionEntry>,
): WalletSummaryRow[] {
  const out: WalletSummaryRow[] = [];
  walletPoints.forEach((entry, user) => {
    const lower = user.toLowerCase();
    const exclusion = excludedWallets.get(lower) ?? null;
    out.push({
      seasonId: SEASON_ID,
      wallet: lower,
      rawVolumeUSDCe6: usdcToBigInt(entry.rawVolumeUSD).toString(),
      eligibleVolumeUSDCe6: usdcToBigInt(entry.eligibleVolumeUSD).toString(),
      cappedVolumeUSDCe6: usdcToBigInt(entry.cappedVolumeUSD).toString(),
      settledBetCount: 0, // populated by caller from activity rows
      excludedBetCount: entry.excludedBets,
      daysActive: entry.daysActive,
      firstBetBonusEligible: entry.firstBetUnlocked,
      activityPointsE6: pointsToBigInt(entry.baseVolumePoints).toString(),
      bonusPointsE6: pointsToBigInt(entry.firstBetBonusPoints).toString(),
      totalPointsE6: pointsToBigInt(entry.seasonPoints).toString(),
      rank: rankByUser.get(lower) ?? null,
      excluded: entry.reviewStatus === "excluded",
      exclusionCode: exclusion?.reason ?? null,
    });
  });
  // Sort: excluded last, otherwise by rank then by wallet
  out.sort((a, b) => {
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    const ra = a.rank ?? Number.MAX_SAFE_INTEGER;
    const rb = b.rank ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.wallet.localeCompare(b.wallet);
  });
  return out;
}

export function attachSettledBetCounts(
  summary: WalletSummaryRow[],
  activityByUser: Map<string, BetActivityRow[]>,
): WalletSummaryRow[] {
  return summary.map(row => {
    const settled = (activityByUser.get(row.wallet) ?? []).filter(r => r.eligible).length;
    return { ...row, settledBetCount: settled };
  });
}

// ── Activity export ────────────────────────────────────────────────────────

export function buildActivityExport(activityByUser: Map<string, BetActivityRow[]>): ActivityExportRow[] {
  const rows: ActivityExportRow[] = [];
  activityByUser.forEach(list => {
    list.forEach(row => rows.push({ seasonId: SEASON_ID, ...row }));
  });
  rows.sort((a, b) => {
    if (a.placedAt !== b.placedAt) return a.placedAt - b.placedAt;
    return a.user.localeCompare(b.user);
  });
  return rows;
}

// ── Exclusion export ───────────────────────────────────────────────────────

export function buildExclusionExport(excludedWallets: Map<string, WalletExclusionEntry>): ExclusionExportRow[] {
  const out: ExclusionExportRow[] = [];
  excludedWallets.forEach((entry, wallet) => {
    out.push({
      seasonId: SEASON_ID,
      wallet: wallet.toLowerCase(),
      excluded: true,
      exclusionCode: entry.reason,
      exclusionReason: EXCLUSION_LABELS[entry.reason] ?? entry.reason,
      notes: entry.notes,
      reviewedBy: entry.reviewedBy,
      reviewedAt: entry.reviewedAt,
    });
  });
  out.sort((a, b) => a.wallet.localeCompare(b.wallet));
  return out;
}

// ── Manifest ───────────────────────────────────────────────────────────────

export function buildManifest(args: {
  config: SeasonConfig;
  walletPoints: Map<string, WalletPoints>;
  excludedWallets: Map<string, WalletExclusionEntry>;
  contracts: SeasonContractsManifest;
  gitCommit?: string | null;
  ponderSnapshotAt?: string | null;
  windowMode: "placed" | "settled";
  refundedRoundsCount: boolean;
  generatedAt?: string;
}): SeasonManifest {
  const totals = (() => {
    const all = Array.from(args.walletPoints.values());
    const eligible = all.filter(w => w.reviewStatus !== "excluded" && w.seasonPoints > 0);
    const totalRaw = sumBigInt(all.map(w => usdcToBigInt(w.rawVolumeUSD)));
    const totalEligible = sumBigInt(eligible.map(w => usdcToBigInt(w.eligibleVolumeUSD)));
    const totalCapped = sumBigInt(all.map(w => usdcToBigInt(w.cappedVolumeUSD)));
    const totalPoints = sumBigInt(eligible.map(w => pointsToBigInt(w.seasonPoints)));
    return {
      wallets: all.length,
      eligibleWallets: eligible.length,
      excludedWallets: all.filter(w => w.reviewStatus === "excluded").length,
      totalRawVolumeUSDC: totalRaw.toString(),
      totalEligibleVolumeUSDC: totalEligible.toString(),
      totalCappedVolumeUSDC: totalCapped.toString(),
      totalPointsE6: totalPoints.toString(),
    };
  })();

  return {
    seasonId: SEASON_ID,
    startUnix: args.config.startUnix,
    endUnix: args.config.endUnix,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    gitCommit: args.gitCommit ?? null,
    ponderSnapshotAt: args.ponderSnapshotAt ?? null,
    contracts: args.contracts,
    rules: {
      ...toPublicSeasonConfig(args.config),
      refundedRoundsCount: args.refundedRoundsCount,
      windowMode: args.windowMode,
    },
    totals,
  };
}

// ── Merkle inputs ──────────────────────────────────────────────────────────

export function buildPointsMerkleInput(summary: WalletSummaryRow[]): PointsMerkleInput {
  const eligible = summary.filter(row => !row.excluded && BigInt(row.totalPointsE6) > 0n);
  const totalPointsE6 = sumBigInt(eligible.map(r => BigInt(r.totalPointsE6)));
  return {
    seasonId: SEASON_ID,
    type: "points_snapshot",
    rewardToken: null,
    rewardTokenAddress: null,
    totalPointsE6: totalPointsE6.toString(),
    entries: eligible.map((row, index) => ({
      index,
      account: row.wallet,
      pointsE6: row.totalPointsE6,
      eligibleVolumeUSDCe6: row.eligibleVolumeUSDCe6,
      rank: row.rank ?? index + 1,
    })),
  };
}

export function buildRewardMerkleInput(args: {
  pointsInput: PointsMerkleInput;
  totalRewardAmountWei: bigint;
  rewardTokenAddress: string;
  rewardTokenSymbol: string;
  chainId: number;
}): RewardMerkleInput {
  const { pointsInput, totalRewardAmountWei } = args;
  const totalPointsE6 = BigInt(pointsInput.totalPointsE6);
  const entries: RewardMerkleEntry[] = pointsInput.entries.map(e => {
    const points = BigInt(e.pointsE6);
    const amount = totalPointsE6 === 0n ? 0n : (points * totalRewardAmountWei) / totalPointsE6;
    return {
      index: e.index,
      account: e.account,
      amount: amount.toString(),
      pointsE6: e.pointsE6,
    };
  });
  return {
    seasonId: SEASON_ID,
    type: "agbets_rewards",
    chainId: args.chainId,
    rewardToken: args.rewardTokenSymbol,
    rewardTokenAddress: args.rewardTokenAddress.toLowerCase(),
    totalRewardAmount: totalRewardAmountWei.toString(),
    entries,
  };
}

// ── CSV serializer ─────────────────────────────────────────────────────────

const csvEscape = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : typeof value === "bigint" ? value.toString() : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export function toCSV<T extends Record<string, unknown>>(rows: T[], columns: (keyof T)[]): string {
  const header = columns.map(c => csvEscape(String(c))).join(",");
  const body = rows.map(row => columns.map(c => csvEscape(row[c])).join(","));
  return [header, ...body].join("\n");
}
