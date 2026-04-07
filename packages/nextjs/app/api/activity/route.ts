import { NextResponse } from "next/server";
import { fetchRecentBetRows } from "~~/utils/bankrbets/server/derivedStats";

export const maxDuration = 10;

const CACHE_TTL_MS = 8_000;
const ACTIVITY_LIMIT = 20;

export interface ActivityItem {
  id: string;
  user: string;
  tokenAddress: string;
  epoch: number;
  amount: number;
  side: "up" | "down";
  placedAt: number;
}

const cache: { data: ActivityItem[]; updatedAt: number; inFlight: Promise<void> | null } = {
  data: [],
  updatedAt: 0,
  inFlight: null,
};

function triggerRefresh(): Promise<void> {
  if (cache.inFlight) return cache.inFlight;

  cache.inFlight = fetchRecentBetRows(ACTIVITY_LIMIT)
    .then(items => {
      cache.data = items;
      cache.updatedAt = Date.now();
    })
    .catch(() => {})
    .finally(() => {
      cache.inFlight = null;
    });

  return cache.inFlight;
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
    { activity: cache.data, updatedAt: cache.updatedAt },
    { headers: { "Cache-Control": "public, max-age=10, stale-while-revalidate=20" } },
  );
}
