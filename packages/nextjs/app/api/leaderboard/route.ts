import { NextResponse } from "next/server";
import { type AbiEvent, createPublicClient, http, parseAbiItem } from "viem";
import { base } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

export const maxDuration = 60;

// ── Config ────────────────────────────────────────────────────────────

const TARGET_CHAIN_ID = base.id;
const CONTRACT_ADDRESS = deployedContracts[TARGET_CHAIN_ID]?.BankrBetsPrediction?.address as `0x${string}` | undefined;
const DEPLOY_BLOCK = BigInt(process.env.BANKRBETS_PREDICTION_DEPLOY_BLOCK || "42823800");
const CACHE_TTL_MS = 2 * 60_000; // 2 minutes
const BLOCK_CHUNK = 50_000n;

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
  // Alchemy Free tier restricts eth_getLogs to a 10-block range, which breaks
  // all event scanning. Use LOGS_RPC_URL (defaults to the public Base RPC) for
  // any endpoint that fetches logs. Upgrade to Alchemy PAYG or set LOGS_RPC_URL
  // to a provider with no range restrictions for higher throughput.
  const rpcUrl = process.env.LOGS_RPC_URL || "https://base-rpc.publicnode.com";
  return createPublicClient({ chain: base, transport: http(rpcUrl) });
}

async function fetchAllLogs(
  client: ReturnType<typeof makeClient>,
  contractAddress: `0x${string}`,
  eventAbi: AbiEvent,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Array<{ args: Record<string, unknown> }>> {
  // Build chunk list then fetch all chunks in parallel for maximum speed
  const chunks: Array<{ from: bigint; to: bigint }> = [];
  for (let from = fromBlock; from <= toBlock; from += BLOCK_CHUNK) {
    const to = from + BLOCK_CHUNK - 1n < toBlock ? from + BLOCK_CHUNK - 1n : toBlock;
    chunks.push({ from, to });
  }

  const results = await Promise.all(
    chunks.map(({ from, to }) =>
      client.getLogs({ address: contractAddress, event: eventAbi, fromBlock: from, toBlock: to }),
    ),
  );

  return results.flat() as Array<{ args: Record<string, unknown> }>;
}

// ── Leaderboard computation ───────────────────────────────────────────

async function buildLeaderboard(): Promise<LeaderboardEntry[]> {
  if (!CONTRACT_ADDRESS) return [];

  const client = makeClient();
  const toBlock = await client.getBlockNumber();
  const fromBlock = DEPLOY_BLOCK;

  const [bullLogs, bearLogs, claimLogs] = await Promise.all([
    fetchAllLogs(client, CONTRACT_ADDRESS, BET_BULL_ABI, fromBlock, toBlock),
    fetchAllLogs(client, CONTRACT_ADDRESS, BET_BEAR_ABI, fromBlock, toBlock),
    fetchAllLogs(client, CONTRACT_ADDRESS, CLAIM_ABI, fromBlock, toBlock),
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
