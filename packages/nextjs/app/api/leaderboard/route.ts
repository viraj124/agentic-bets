import { NextResponse } from "next/server";

export const maxDuration = 30;

// ── Config ────────────────────────────────────────────────────────────

const PONDER_URL = process.env.PONDER_URL || "http://localhost:42069";
const CACHE_TTL_MS = 2 * 60_000; // 2 minutes

// ── Types ─────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  address: string;
  totalBets: number;
  totalWagered: number;
  totalWon: number;
  netPnL: number;
  wins: number;
  winRate: number;
}

interface CacheEntry {
  data: LeaderboardEntry[];
  updatedAt: number;
  refreshInFlight: Promise<void> | null;
}

// ── Module-level cache ────────────────────────────────────────────────
// Cold starts now cost ~50ms (Ponder GraphQL query) vs 10–15s (getLogs scan).

const cache: CacheEntry = {
  data: [],
  updatedAt: 0,
  refreshInFlight: null,
};

// ── Ponder GraphQL query ──────────────────────────────────────────────

async function buildLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${PONDER_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      query: `{
        userStatss(limit: 1000) {
          items { id totalBets totalWagered totalWon wins }
        }
      }`,
    }),
  });

  if (!res.ok) throw new Error(`Ponder error: ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);

  const items: Array<{
    id: string;
    totalBets: number;
    totalWagered: string;
    totalWon: string;
    wins: number;
  }> = json.data?.userStatss?.items ?? [];

  return items
    .map(row => {
      const wagered = Number(BigInt(row.totalWagered)) / 1e6;
      const won = Number(BigInt(row.totalWon)) / 1e6;
      return {
        address: row.id,
        totalBets: row.totalBets,
        totalWagered: wagered,
        totalWon: won,
        netPnL: won - wagered,
        wins: row.wins,
        winRate: row.totalBets > 0 ? (row.wins / row.totalBets) * 100 : 0,
      };
    })
    .sort((a, b) => b.netPnL - a.netPnL);
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

// ── Route handler ─────────────────────────────────────────────────────

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
