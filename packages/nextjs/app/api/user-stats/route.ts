import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  type DerivedUserStats,
  enrichBetRows,
  fetchAllBetRows,
  getUserStatsFromBets,
} from "~~/utils/bankrbets/server/derivedStats";

export const maxDuration = 15;

const CACHE_TTL_MS = 60_000;

type CacheRecord = {
  ts: number;
  data: DerivedUserStats | null;
};

const cache = new Map<string, CacheRecord>();

export async function GET(req: NextRequest) {
  const userAddress = req.nextUrl.searchParams.get("address");
  if (!userAddress || !isAddress(userAddress)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const id = userAddress.toLowerCase();
  const cached = cache.get(id);
  const hasFreshCache = !!cached && Date.now() - cached.ts < CACHE_TTL_MS;
  if (hasFreshCache) {
    return NextResponse.json(
      { stats: cached!.data },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } },
    );
  }

  try {
    const rows = await fetchAllBetRows(id);
    const enriched = await enrichBetRows(rows);
    const stats = getUserStatsFromBets(id, enriched);

    cache.set(id, { ts: Date.now(), data: stats });

    return NextResponse.json(
      { stats },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } },
    );
  } catch {
    return NextResponse.json(
      { stats: cached?.data ?? null },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } },
    );
  }
}
