import { NextResponse } from "next/server";
import { type AbiEvent, createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";

export const maxDuration = 60;

// ── Config ────────────────────────────────────────────────────────────

const CONTRACT_ADDRESS = "0x3469E0EAc359E3F7e05E909861b6eDc3Be3bda65" as const;
const DEPLOY_BLOCK = 42_652_499n;
const CACHE_TTL_MS = 2 * 60_000; // 2 minutes
const BLOCK_CHUNK = 50_000n; // Alchemy getLogs limit per request

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

const cache: CacheEntry = {
  data: [],
  updatedAt: 0,
  refreshInFlight: null,
};

// ── Event ABIs ────────────────────────────────────────────────────────

const BET_BULL_ABI = parseAbiItem(
  "event BetBull(address indexed sender, address indexed token, uint256 indexed epoch, uint256 amount)",
);
const BET_BEAR_ABI = parseAbiItem(
  "event BetBear(address indexed sender, address indexed token, uint256 indexed epoch, uint256 amount)",
);
const CLAIM_ABI = parseAbiItem(
  "event Claim(address indexed sender, address indexed token, uint256 indexed epoch, uint256 amount)",
);

// ── Helpers ───────────────────────────────────────────────────────────

function makeClient() {
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  const rpcUrl = alchemyKey ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}` : "https://mainnet.base.org";

  return createPublicClient({ chain: base, transport: http(rpcUrl) });
}

async function fetchAllLogs(
  client: ReturnType<typeof makeClient>,
  eventAbi: AbiEvent,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Array<{ args: Record<string, unknown> }>> {
  const all: Array<{ args: Record<string, unknown> }> = [];

  for (let from = fromBlock; from <= toBlock; from += BLOCK_CHUNK) {
    const to = from + BLOCK_CHUNK - 1n < toBlock ? from + BLOCK_CHUNK - 1n : toBlock;
    const logs = await client.getLogs({
      address: CONTRACT_ADDRESS,
      event: eventAbi,
      fromBlock: from,
      toBlock: to,
    });
    all.push(...(logs as Array<{ args: Record<string, unknown> }>));
  }

  return all;
}

// ── Leaderboard computation ───────────────────────────────────────────

async function buildLeaderboard(): Promise<LeaderboardEntry[]> {
  const client = makeClient();
  const toBlock = await client.getBlockNumber();
  const fromBlock = DEPLOY_BLOCK;

  const [bullLogs, bearLogs, claimLogs] = await Promise.all([
    fetchAllLogs(client, BET_BULL_ABI, fromBlock, toBlock),
    fetchAllLogs(client, BET_BEAR_ABI, fromBlock, toBlock),
    fetchAllLogs(client, CLAIM_ABI, fromBlock, toBlock),
  ]);

  const statsMap = new Map<string, { bets: number; wagered: number; won: number; wins: number }>();

  const getOrCreate = (addr: string) => {
    const key = addr.toLowerCase();
    if (!statsMap.has(key)) statsMap.set(key, { bets: 0, wagered: 0, won: 0, wins: 0 });
    return statsMap.get(key)!;
  };

  for (const log of bullLogs) {
    const addr = log.args.sender as string | undefined;
    const amount = log.args.amount as bigint | undefined;
    if (!addr) continue;
    const stats = getOrCreate(addr);
    stats.bets++;
    stats.wagered += Number(amount ?? 0n) / 1e6;
  }

  for (const log of bearLogs) {
    const addr = log.args.sender as string | undefined;
    const amount = log.args.amount as bigint | undefined;
    if (!addr) continue;
    const stats = getOrCreate(addr);
    stats.bets++;
    stats.wagered += Number(amount ?? 0n) / 1e6;
  }

  for (const log of claimLogs) {
    const addr = log.args.sender as string | undefined;
    const amount = log.args.amount as bigint | undefined;
    if (!addr) continue;
    const won = Number(amount ?? 0n) / 1e6;
    if (won > 0) {
      const stats = getOrCreate(addr);
      stats.won += won;
      stats.wins++;
    }
  }

  return Array.from(statsMap.entries())
    .map(([address, s]) => ({
      address,
      totalBets: s.bets,
      totalWagered: s.wagered,
      totalWon: s.won,
      netPnL: s.won - s.wagered,
      wins: s.wins,
      winRate: s.bets > 0 ? (s.wins / s.bets) * 100 : 0,
    }))
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
    // Cold start — wait for first build
    await triggerRefresh();
  } else if (!isFresh) {
    // Stale — serve immediately, refresh in background
    void triggerRefresh();
  }

  return NextResponse.json(
    { leaderboard: cache.data, updatedAt: cache.updatedAt },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } },
  );
}
