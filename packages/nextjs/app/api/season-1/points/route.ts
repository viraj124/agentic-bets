import { NextResponse } from "next/server";
import {
  SEASON_1_CONFIG,
  type SeasonConfig,
  emptyWalletPoints,
  toPublicSeasonConfig,
} from "~~/utils/bankrbets/seasonPoints";
import { getSeasonComputed } from "~~/utils/bankrbets/server/seasonComputed";

export const maxDuration = 30;

const ADDRESS_RE = /^0x[0-9a-f]{40}$/;

function getRuntimeConfig(): SeasonConfig {
  const start = process.env.SEASON_1_START_TS;
  const end = process.env.SEASON_1_END_TS;
  return {
    ...SEASON_1_CONFIG,
    startUnix: start ? Number(start) : SEASON_1_CONFIG.startUnix,
    endUnix: end ? Number(end) : SEASON_1_CONFIG.endUnix,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("address");
  const address = raw?.toLowerCase();

  if (!address || !ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "valid address required" }, { status: 400 });
  }

  const config = getRuntimeConfig();

  try {
    const { walletPoints, activityByUser, rankByUser, updatedAt } = await getSeasonComputed(config);
    const wallet = walletPoints.get(address) ?? emptyWalletPoints(address);
    const activity = activityByUser.get(address) ?? [];
    const rank = rankByUser.get(address) ?? null;

    return NextResponse.json(
      { wallet, activity, rank, season: toPublicSeasonConfig(config), updatedAt },
      { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "season points unavailable" },
      { status: 502 },
    );
  }
}
