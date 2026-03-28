import { NextResponse } from "next/server";
import {
  type DerivedUserStats,
  aggregateUserStats,
  enrichBetRows,
  fetchAllBetRows,
} from "~~/utils/bankrbets/server/derivedStats";

export const maxDuration = 30;

const CACHE_TTL_MS = 2 * 60_000; // 2 minutes

export type LeaderboardEntry = DerivedUserStats;

interface CacheEntry {
  data: LeaderboardEntry[];
  updatedAt: number;
  refreshInFlight: Promise<void> | null;
}

const cache: CacheEntry = {
  data: [],
  updatedAt: 0,
  refreshInFlight: null,
};

async function buildLeaderboard(): Promise<LeaderboardEntry[]> {
  const rows = await fetchAllBetRows();
  const enriched = await enrichBetRows(rows);
  return aggregateUserStats(enriched).sort((a, b) => b.netPnL - a.netPnL);
}

function triggerRefresh(): Promise<void> {
  if (cache.refreshInFlight) return cache.refreshInFlight;

  cache.refreshInFlight = buildLeaderboard()
    .then(data => {
      cache.data = data;
      cache.updatedAt = Date.now();
    })
    .catch(() => {
      // Keep stale data on error
    })
    .finally(() => {
      cache.refreshInFlight = null;
    });

  return cache.refreshInFlight;
}

export async function GET() {
  const hasCache = cache.data.length > 0;
  const isFresh = hasCache && Date.now() - cache.updatedAt < CACHE_TTL_MS;

  if (!hasCache) {
    await triggerRefresh();
  } else if (!isFresh) {
    void triggerRefresh();
  }

  return NextResponse.json(
    { leaderboard: cache.data, updatedAt: cache.updatedAt },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } },
  );
}
