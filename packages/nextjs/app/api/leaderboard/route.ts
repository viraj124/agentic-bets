import { NextResponse } from "next/server";
import {
  type DerivedUserStats,
  aggregateUserStats,
  getEnrichedBetsCached,
} from "~~/utils/bankrbets/server/derivedStats";

export const maxDuration = 30;

export type LeaderboardEntry = DerivedUserStats;

export async function GET() {
  const enriched = await getEnrichedBetsCached();
  const leaderboard = aggregateUserStats(enriched).sort((a, b) => b.netPnL - a.netPnL);

  return NextResponse.json(
    { leaderboard, updatedAt: Date.now() },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } },
  );
}
