import "server-only";
import { createPublicClient, fallback, http } from "viem";
import { base } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

const PONDER_URL = process.env.PONDER_URL || "http://localhost:42069";
const GRAPHQL_PAGE_SIZE = 500;
const MAX_GRAPHQL_PAGES = 20;

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;
const baseClient = createPublicClient({
  chain: base,
  transport: fallback(
    [
      ...(ALCHEMY_KEY ? [http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`)] : []),
      http("https://base-rpc.publicnode.com"),
      http("https://mainnet.base.org"),
    ],
    { rank: true },
  ),
});

const predictionAddress = deployedContracts?.[8453]?.BankrBetsPrediction?.address as `0x${string}` | undefined;

const predictionReadAbi = [
  {
    type: "function",
    name: "getCurrentEpoch",
    inputs: [{ name: "_token", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRound",
    inputs: [
      { name: "_token", type: "address" },
      { name: "_epoch", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "epoch", type: "uint256" },
          { name: "startTimestamp", type: "uint256" },
          { name: "lockTimestamp", type: "uint256" },
          { name: "closeTimestamp", type: "uint256" },
          { name: "lockPrice", type: "int256" },
          { name: "closePrice", type: "int256" },
          { name: "totalAmount", type: "uint256" },
          { name: "bullAmount", type: "uint256" },
          { name: "bearAmount", type: "uint256" },
          { name: "rewardBaseCalAmount", type: "uint256" },
          { name: "rewardAmount", type: "uint256" },
          { name: "locked", type: "bool" },
          { name: "oracleCalled", type: "bool" },
          { name: "cancelled", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

interface GraphQlPageInfo {
  hasNextPage: boolean;
  endCursor?: string | null;
}

interface BetRow {
  id: string;
  user: string;
  token: string;
  epoch: string;
  amount: string;
  position: number;
  claimed: boolean;
  claimedAmount: string;
  placedAt: string;
}

type RoundResult = {
  closePrice: bigint;
  lockPrice: bigint;
  oracleCalled: boolean;
  cancelled: boolean;
  rewardAmount: bigint;
  rewardBaseCalAmount: bigint;
  bullAmount: bigint;
  bearAmount: bigint;
};

export type BetOutcome = "ongoing" | "won" | "lost" | "refund" | "pending";

export interface EnrichedBet {
  id: string;
  user: string;
  tokenAddress: string;
  epoch: number;
  amount: number;
  side: "up" | "down";
  claimed: boolean;
  claimedAmount: number;
  isOngoing: boolean;
  outcome: BetOutcome;
  expectedPayout: number;
  href: string;
  placedAt: number;
}

export interface DerivedUserStats {
  address: string;
  totalBets: number;
  totalWagered: number;
  totalWon: number;
  netPnL: number;
  wins: number;
  winRate: number;
}

type MutableDerivedUserStats = DerivedUserStats & {
  resolvedDecisionBets: number;
};

function toNumberFromUSDC(raw: string | bigint) {
  try {
    return Number(typeof raw === "bigint" ? raw : BigInt(raw)) / 1e6;
  } catch {
    return 0;
  }
}

function buildBetParticipationsQuery(address: string | undefined, after?: string) {
  const clauses = [
    address ? `where: { user: \"${address}\" }` : "",
    'orderBy: "placedAt"',
    'orderDirection: "desc"',
    after ? `after: ${JSON.stringify(after)}` : "",
    `limit: ${GRAPHQL_PAGE_SIZE}`,
  ].filter(Boolean);

  return `{
    betParticipations(${clauses.join(", ")}) {
      items {
        id
        user
        token
        epoch
        amount
        position
        claimed
        claimedAmount
        placedAt
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }`;
}

async function fetchBetRowsPage(address: string | undefined, after?: string) {
  const res = await fetch(`${PONDER_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      query: buildBetParticipationsQuery(address, after),
    }),
  });

  if (!res.ok) {
    throw new Error(`Ponder error: ${res.status}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message || "Ponder query failed");
  }

  const page = json.data?.betParticipations as { items?: BetRow[]; pageInfo?: GraphQlPageInfo } | undefined;
  return {
    items: page?.items ?? [],
    pageInfo: page?.pageInfo ?? { hasNextPage: false, endCursor: null },
  };
}

export async function fetchAllBetRows(address?: string) {
  const rows: BetRow[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_GRAPHQL_PAGES; page++) {
    const { items, pageInfo } = await fetchBetRowsPage(address, cursor);
    rows.push(...items);

    if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
    cursor = pageInfo.endCursor;
  }

  return rows;
}

export async function enrichBetRows(rows: BetRow[]): Promise<EnrichedBet[]> {
  if (!rows.length) return [];

  const tokens = Array.from(new Set(rows.map(row => row.token.toLowerCase() as `0x${string}`)));
  const currentEpochByToken = new Map<string, bigint>();
  const openCurrentByToken = new Map<string, boolean>();

  if (predictionAddress && tokens.length > 0) {
    const epochResults = await baseClient.multicall({
      contracts: tokens.map(token => ({
        address: predictionAddress,
        abi: predictionReadAbi,
        functionName: "getCurrentEpoch" as const,
        args: [token] as const,
      })),
      allowFailure: true,
    });

    for (let i = 0; i < tokens.length; i++) {
      const result = epochResults[i];
      if (result.status === "success" && result.result) {
        currentEpochByToken.set(tokens[i], result.result as bigint);
      }
    }

    const currentRoundContracts: Array<{
      address: `0x${string}`;
      abi: typeof predictionReadAbi;
      functionName: "getRound";
      args: readonly [`0x${string}`, bigint];
    }> = [];
    const currentRoundTokens: string[] = [];

    for (const token of tokens) {
      const epoch = currentEpochByToken.get(token);
      if (epoch && epoch > 0n) {
        currentRoundTokens.push(token);
        currentRoundContracts.push({
          address: predictionAddress,
          abi: predictionReadAbi,
          functionName: "getRound" as const,
          args: [token, epoch] as const,
        });
      }
    }

    if (currentRoundContracts.length > 0) {
      const currentRoundResults = await baseClient.multicall({
        contracts: currentRoundContracts,
        allowFailure: true,
      });

      for (let i = 0; i < currentRoundContracts.length; i++) {
        const result = currentRoundResults[i];
        if (result.status === "success" && result.result) {
          openCurrentByToken.set(currentRoundTokens[i], !(result.result as RoundResult).oracleCalled);
        }
      }
    }
  }

  const bets: EnrichedBet[] = rows.map(row => {
    const tokenAddress = row.token.toLowerCase();
    const epochBigInt = BigInt(row.epoch);
    const currentEpoch = currentEpochByToken.get(tokenAddress);
    const isCurrentEpoch = !!currentEpoch && currentEpoch > 0n && currentEpoch === epochBigInt;
    const currentRoundOpen = openCurrentByToken.get(tokenAddress) ?? false;
    const isOngoing = !row.claimed && isCurrentEpoch && currentRoundOpen;
    const amount = toNumberFromUSDC(row.amount);
    const claimedAmount = toNumberFromUSDC(row.claimedAmount);

    let outcome: BetOutcome = "pending";
    if (isOngoing) {
      outcome = "ongoing";
    } else if (row.claimed) {
      outcome = claimedAmount > amount ? "won" : claimedAmount > 0 ? "refund" : "lost";
    }

    return {
      id: row.id,
      user: row.user.toLowerCase(),
      tokenAddress,
      epoch: Number(epochBigInt),
      amount,
      side: row.position === 0 ? "up" : "down",
      claimed: row.claimed,
      claimedAmount,
      isOngoing,
      outcome,
      expectedPayout: row.claimed ? claimedAmount : 0,
      href: `/market?round=${epochBigInt.toString()}#${tokenAddress}`,
      placedAt: Number(BigInt(row.placedAt)),
    };
  });

  const unresolved = bets.filter(bet => bet.outcome === "pending" && !bet.isOngoing);
  if (!predictionAddress || unresolved.length === 0) return bets;

  const roundKeys = new Map<string, { token: `0x${string}`; epoch: bigint }>();
  for (const bet of unresolved) {
    const key = `${bet.tokenAddress}:${bet.epoch}`;
    if (!roundKeys.has(key)) {
      roundKeys.set(key, { token: bet.tokenAddress as `0x${string}`, epoch: BigInt(bet.epoch) });
    }
  }

  const roundEntries = Array.from(roundKeys.entries());
  const roundResults = await baseClient.multicall({
    contracts: roundEntries.map(([, { token, epoch }]) => ({
      address: predictionAddress,
      abi: predictionReadAbi,
      functionName: "getRound" as const,
      args: [token, epoch] as const,
    })),
    allowFailure: true,
  });

  const roundDataMap = new Map<string, RoundResult>();
  for (let i = 0; i < roundEntries.length; i++) {
    const result = roundResults[i];
    if (result.status === "success" && result.result) {
      roundDataMap.set(roundEntries[i][0], result.result as RoundResult);
    }
  }

  for (const bet of unresolved) {
    const round = roundDataMap.get(`${bet.tokenAddress}:${bet.epoch}`);
    if (!round || !round.oracleCalled) {
      bet.outcome = "pending";
      continue;
    }

    if (round.cancelled) {
      bet.outcome = "refund";
      bet.expectedPayout = bet.amount;
      continue;
    }

    const userBetUp = bet.side === "up";
    const isTie = round.closePrice === round.lockPrice;
    let won: boolean;
    if (isTie) {
      // MajorityWins tiebreaker: side with more USDC wins
      const bullWon = round.bullAmount > round.bearAmount;
      won = (userBetUp && bullWon) || (!userBetUp && !bullWon);
    } else {
      const upWon = round.closePrice > round.lockPrice;
      won = (userBetUp && upWon) || (!userBetUp && !upWon);
    }
    if (won && Number(round.rewardBaseCalAmount) > 0) {
      bet.outcome = "won";
      bet.expectedPayout = bet.amount * (Number(round.rewardAmount) / Number(round.rewardBaseCalAmount));
    } else {
      bet.outcome = "lost";
    }
  }

  return bets;
}

export function partitionUserBets(bets: EnrichedBet[]) {
  return {
    ongoing: bets.filter(bet => bet.isOngoing),
    previous: bets.filter(bet => !bet.isOngoing),
  };
}

export function aggregateUserStats(bets: EnrichedBet[]) {
  const byUser = new Map<string, MutableDerivedUserStats>();

  for (const bet of bets) {
    const address = bet.user.toLowerCase();
    let stats = byUser.get(address);
    if (!stats) {
      stats = {
        address,
        totalBets: 0,
        totalWagered: 0,
        totalWon: 0,
        netPnL: 0,
        wins: 0,
        winRate: 0,
        resolvedDecisionBets: 0,
      };
      byUser.set(address, stats);
    }

    if (bet.outcome !== "refund") {
      stats.totalBets += 1;
      stats.totalWagered += bet.amount;
    }

    if (bet.outcome === "won") {
      const payout = bet.claimed ? bet.claimedAmount : bet.expectedPayout;
      stats.wins += 1;
      stats.resolvedDecisionBets += 1;
      stats.totalWon += payout;
      stats.netPnL += payout - bet.amount;
      continue;
    }

    if (bet.outcome === "lost") {
      stats.resolvedDecisionBets += 1;
      stats.netPnL -= bet.amount;
    }
  }

  return Array.from(byUser.values()).map(({ resolvedDecisionBets, ...stats }) => ({
    ...stats,
    winRate: resolvedDecisionBets > 0 ? (stats.wins / resolvedDecisionBets) * 100 : 0,
  }));
}

export function getUserStatsFromBets(address: string, bets: EnrichedBet[]) {
  const stats = aggregateUserStats(bets).find(entry => entry.address === address.toLowerCase());
  return stats ?? null;
}
