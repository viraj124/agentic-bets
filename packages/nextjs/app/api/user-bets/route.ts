import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  type EnrichedBet,
  enrichBetRows,
  fetchAllBetRows,
  partitionUserBets,
} from "~~/utils/bankrbets/server/derivedStats";

export const maxDuration = 15;

const CACHE_TTL_MS = 60_000;

type CacheRecord = {
  ts: number;
  data: {
    ongoing: EnrichedBet[];
    previous: EnrichedBet[];
  };
};

const cache = new Map<string, CacheRecord>();

export async function GET(req: NextRequest) {
  const userAddress = req.nextUrl.searchParams.get("address");
  if (!userAddress || !isAddress(userAddress)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const id = userAddress.toLowerCase();
  const cached = cache.get(id);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(
      { ...cached.data, updatedAt: cached.ts },
      { headers: { "Cache-Control": "public, max-age=20, stale-while-revalidate=40" } },
    );
  }

  try {
    const rows = await fetchAllBetRows(id);
    const enriched = await enrichBetRows(rows);
    const data = partitionUserBets(enriched);

    cache.set(id, { ts: Date.now(), data });

    return NextResponse.json(
      { ...data, updatedAt: Date.now() },
      { headers: { "Cache-Control": "public, max-age=20, stale-while-revalidate=40" } },
    );
  } catch {
    return NextResponse.json(
      {
        ongoing: cached?.data.ongoing ?? [],
        previous: cached?.data.previous ?? [],
        updatedAt: cached?.ts ?? Date.now(),
      },
      { headers: { "Cache-Control": "public, max-age=20, stale-while-revalidate=40" } },
    );
  }
}
