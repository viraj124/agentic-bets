import { NextResponse } from "next/server";
import { SEASON_1_CONFIG, type SeasonConfig, toPublicSeasonConfig } from "~~/utils/bankrbets/seasonPoints";
import { aggregateUserStats, getEnrichedBetsCached } from "~~/utils/bankrbets/server/derivedStats";
import { getSeasonComputed } from "~~/utils/bankrbets/server/seasonComputed";

export const maxDuration = 30;

function getRuntimeConfig(): SeasonConfig {
  const start = process.env.SEASON_1_START_TS;
  const end = process.env.SEASON_1_END_TS;
  return {
    ...SEASON_1_CONFIG,
    startUnix: start ? Number(start) : SEASON_1_CONFIG.startUnix,
    endUnix: end ? Number(end) : SEASON_1_CONFIG.endUnix,
  };
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "all-time" ? "all-time" : "season";

  try {
    if (mode === "all-time") {
      const enriched = await getEnrichedBetsCached();
      const leaderboard = aggregateUserStats(enriched).sort((a, b) => b.netPnL - a.netPnL);
      const stats = leaderboard.reduce(
        (acc, entry) => ({
          totalBets: acc.totalBets + finiteNumber(entry.totalBets),
          totalVolume: acc.totalVolume + finiteNumber(entry.totalWagered),
          totalPlayers: acc.totalPlayers + (finiteNumber(entry.totalBets) > 0 ? 1 : 0),
        }),
        { totalBets: 0, totalVolume: 0, totalPlayers: 0 },
      );
      return NextResponse.json(
        { mode, leaderboard, stats, updatedAt: Date.now() },
        { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } },
      );
    }

    const config = getRuntimeConfig();
    const { sortedLeaderboard, updatedAt } = await getSeasonComputed(config);

    return NextResponse.json(
      { mode, leaderboard: sortedLeaderboard, season: toPublicSeasonConfig(config), updatedAt },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "leaderboard unavailable" },
      { status: 502 },
    );
  }
}
