import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, fallback, http, isAddress } from "viem";
import { base } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

export const maxDuration = 15;

const PONDER_URL = process.env.PONDER_URL || "http://localhost:42069";
const CACHE_TTL_MS = 60_000;

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

interface BetRow {
  id: string;
  token: string;
  epoch: string;
  amount: string;
  position: number;
  claimed: boolean;
  claimedAmount: string;
  placedAt: string;
}

type BetOutcome = "ongoing" | "won" | "lost" | "refund" | "pending";

interface UserBetItem {
  id: string;
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

type CacheRecord = {
  ts: number;
  data: {
    ongoing: UserBetItem[];
    previous: UserBetItem[];
  };
};

const cache = new Map<string, CacheRecord>();
const predictionAddress = deployedContracts?.[8453]?.BankrBetsPrediction?.address as `0x${string}` | undefined;

function toNumberFromUSDC(raw: string) {
  try {
    return Number(BigInt(raw)) / 1e6;
  } catch {
    return 0;
  }
}

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
    const res = await fetch(`${PONDER_URL}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        query: `{
          betParticipations(where: { user: "${id}" }, orderBy: "placedAt", orderDirection: "desc", limit: 150) {
            items {
              id
              token
              epoch
              amount
              position
              claimed
              claimedAmount
              placedAt
            }
          }
        }`,
      }),
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          ongoing: cached?.data.ongoing ?? [],
          previous: cached?.data.previous ?? [],
          updatedAt: cached?.ts ?? Date.now(),
        },
        { headers: { "Cache-Control": "public, max-age=20, stale-while-revalidate=40" } },
      );
    }

    const json = await res.json();
    const rows = (json.data?.betParticipations?.items as BetRow[] | undefined) ?? [];

    if (!rows.length) {
      const data = { ongoing: [], previous: [] };
      cache.set(id, { ts: Date.now(), data });
      return NextResponse.json(
        { ...data, updatedAt: Date.now() },
        { headers: { "Cache-Control": "public, max-age=20, stale-while-revalidate=40" } },
      );
    }

    const tokens = Array.from(new Set(rows.map(row => row.token.toLowerCase() as `0x${string}`)));

    // Batch all getCurrentEpoch calls into a single multicall
    const currentEpochByToken = new Map<string, bigint>();
    const openCurrentByToken = new Map<string, boolean>();
    if (predictionAddress && tokens.length > 0) {
      const epochCalls = tokens.map(token => ({
        address: predictionAddress,
        abi: predictionReadAbi,
        functionName: "getCurrentEpoch" as const,
        args: [token] as const,
      }));

      const epochResults = await baseClient.multicall({ contracts: epochCalls, allowFailure: true });
      for (let i = 0; i < tokens.length; i++) {
        const r = epochResults[i];
        if (r.status === "success" && r.result) {
          currentEpochByToken.set(tokens[i], r.result as bigint);
        }
      }

      // Batch all getRound calls for current epochs into a single multicall
      const roundTokenOrder: string[] = [];
      const roundContracts: Array<{
        address: `0x${string}`;
        abi: typeof predictionReadAbi;
        functionName: "getRound";
        args: readonly [`0x${string}`, bigint];
      }> = [];
      for (const token of tokens) {
        const epoch = currentEpochByToken.get(token);
        if (epoch && epoch > 0n) {
          roundTokenOrder.push(token);
          roundContracts.push({
            address: predictionAddress,
            abi: predictionReadAbi,
            functionName: "getRound" as const,
            args: [token as `0x${string}`, epoch] as const,
          });
        }
      }

      if (roundContracts.length > 0) {
        const roundResults = await baseClient.multicall({ contracts: roundContracts, allowFailure: true });
        for (let i = 0; i < roundContracts.length; i++) {
          const r = roundResults[i];
          if (r.status === "success" && r.result) {
            openCurrentByToken.set(roundTokenOrder[i], !(r.result as { oracleCalled: boolean }).oracleCalled);
          }
        }
      }
    }

    const bets: UserBetItem[] = rows.map(row => {
      const tokenAddress = row.token.toLowerCase();
      const epochBigInt = BigInt(row.epoch);
      const currentEpoch = currentEpochByToken.get(tokenAddress);
      const isCurrentEpoch = !!currentEpoch && currentEpoch > 0n && currentEpoch === epochBigInt;
      const currentRoundOpen = openCurrentByToken.get(tokenAddress) ?? false;
      const isOngoing = !row.claimed && isCurrentEpoch && currentRoundOpen;

      const amount = toNumberFromUSDC(row.amount);
      const claimedAmount = toNumberFromUSDC(row.claimedAmount);

      // Determine outcome for claimed bets immediately
      let outcome: BetOutcome = "pending";
      if (isOngoing) {
        outcome = "ongoing";
      } else if (row.claimed) {
        outcome = claimedAmount > amount ? "won" : claimedAmount > 0 ? "refund" : "lost";
      }
      // unclaimed non-ongoing bets stay as "pending" — resolved below via RPC

      return {
        id: row.id,
        tokenAddress,
        epoch: Number(epochBigInt),
        amount,
        side: row.position === 0 ? ("up" as const) : ("down" as const),
        claimed: row.claimed,
        claimedAmount,
        isOngoing,
        outcome,
        expectedPayout: row.claimed ? claimedAmount : 0,
        href: `/market?round=${epochBigInt.toString()}#${tokenAddress}`,
        placedAt: Number(BigInt(row.placedAt)),
      };
    });

    // For unclaimed non-ongoing bets, fetch round data to determine outcome
    const unresolved = bets.filter(b => b.outcome === "pending" && !b.isOngoing);
    if (predictionAddress && unresolved.length > 0) {
      const roundKeys = new Map<string, { token: `0x${string}`; epoch: bigint }>();
      for (const bet of unresolved) {
        const key = `${bet.tokenAddress}:${bet.epoch}`;
        if (!roundKeys.has(key)) {
          roundKeys.set(key, { token: bet.tokenAddress as `0x${string}`, epoch: BigInt(bet.epoch) });
        }
      }

      type RoundResult = {
        closePrice: bigint;
        lockPrice: bigint;
        oracleCalled: boolean;
        cancelled: boolean;
        rewardAmount: bigint;
        rewardBaseCalAmount: bigint;
      };

      const roundDataMap = new Map<string, RoundResult>();
      const keyList = Array.from(roundKeys.entries());
      const unresolvedCalls = keyList.map(([, { token, epoch }]) => ({
        address: predictionAddress,
        abi: predictionReadAbi,
        functionName: "getRound" as const,
        args: [token, epoch] as const,
      }));
      const unresolvedResults = await baseClient.multicall({ contracts: unresolvedCalls, allowFailure: true });
      for (let i = 0; i < keyList.length; i++) {
        const r = unresolvedResults[i];
        if (r.status === "success" && r.result) {
          roundDataMap.set(keyList[i][0], r.result as unknown as RoundResult);
        }
      }

      for (const bet of unresolved) {
        const key = `${bet.tokenAddress}:${bet.epoch}`;
        const round = roundDataMap.get(key);
        if (!round || !round.oracleCalled) {
          bet.outcome = "pending";
          continue;
        }
        if (round.cancelled) {
          bet.outcome = "refund";
          bet.expectedPayout = bet.amount;
          continue;
        }
        const upWon = round.closePrice > round.lockPrice;
        const userBetUp = bet.side === "up";
        const won = (userBetUp && upWon) || (!userBetUp && !upWon);
        if (won && Number(round.rewardBaseCalAmount) > 0) {
          bet.outcome = "won";
          bet.expectedPayout = bet.amount * (Number(round.rewardAmount) / Number(round.rewardBaseCalAmount));
        } else {
          bet.outcome = "lost";
        }
      }
    }

    const data = {
      ongoing: bets.filter(bet => bet.isOngoing),
      previous: bets.filter(bet => !bet.isOngoing),
    };

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
