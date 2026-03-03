import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";

export const maxDuration = 15;

const PONDER_URL = process.env.PONDER_URL || "http://localhost:42069";
const CACHE_TTL_MS = 60_000;

interface UserStats {
  address: string;
  totalBets: number;
  totalWagered: number;
  totalWon: number;
  netPnL: number;
  wins: number;
  winRate: number;
}

type CacheRecord = {
  ts: number;
  data: UserStats | null;
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
    const res = await fetch(`${PONDER_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(3_000),
      body: JSON.stringify({
        query: `{ userStats(id: "${id}") { id totalBets totalWagered totalWon wins } }`,
      }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { stats: cached?.data ?? null },
        { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } },
      );
    }

    const json = await res.json();
    const row = json.data?.userStats as {
      id: string;
      totalBets: number;
      totalWagered: string;
      totalWon: string;
      wins: number;
    } | null;

    if (!row) {
      cache.set(id, { ts: Date.now(), data: null });
      return NextResponse.json(
        { stats: null },
        { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } },
      );
    }

    const wagered = Number(BigInt(row.totalWagered)) / 1e6;
    const won = Number(BigInt(row.totalWon)) / 1e6;
    const stats: UserStats = {
      address: row.id,
      totalBets: row.totalBets,
      totalWagered: wagered,
      totalWon: won,
      netPnL: won - wagered,
      wins: row.wins,
      winRate: row.totalBets > 0 ? (row.wins / row.totalBets) * 100 : 0,
    };
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
