import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";

const PAGE_SIZE = 5;

export type RoundData = {
  epoch: bigint;
  startTimestamp: bigint;
  lockTimestamp: bigint;
  closeTimestamp: bigint;
  lockPrice: bigint;
  closePrice: bigint;
  totalAmount: bigint;
  bullAmount: bigint;
  bearAmount: bigint;
  rewardBaseCalAmount: bigint;
  rewardAmount: bigint;
  locked: boolean;
  oracleCalled: boolean;
  cancelled: boolean;
};

export type BetData = {
  position: number;
  amount: bigint;
  claimed: boolean;
};

export type RoundHistoryEntry = {
  epoch: bigint;
  round: RoundData | null;
  userBet: BetData | null;
};

const getRoundAbi = [
  {
    type: "function" as const,
    name: "getRound" as const,
    inputs: [
      { name: "_token", type: "address" as const },
      { name: "_epoch", type: "uint256" as const },
    ],
    outputs: [
      {
        name: "",
        type: "tuple" as const,
        components: [
          { name: "epoch", type: "uint256" as const },
          { name: "startTimestamp", type: "uint256" as const },
          { name: "lockTimestamp", type: "uint256" as const },
          { name: "closeTimestamp", type: "uint256" as const },
          { name: "lockPrice", type: "int256" as const },
          { name: "closePrice", type: "int256" as const },
          { name: "totalAmount", type: "uint256" as const },
          { name: "bullAmount", type: "uint256" as const },
          { name: "bearAmount", type: "uint256" as const },
          { name: "rewardBaseCalAmount", type: "uint256" as const },
          { name: "rewardAmount", type: "uint256" as const },
          { name: "locked", type: "bool" as const },
          { name: "oracleCalled", type: "bool" as const },
          { name: "cancelled", type: "bool" as const },
        ],
      },
    ],
    stateMutability: "view" as const,
  },
] as const;

const getUserBetAbi = [
  {
    type: "function" as const,
    name: "getUserBet" as const,
    inputs: [
      { name: "_token", type: "address" as const },
      { name: "_epoch", type: "uint256" as const },
      { name: "_user", type: "address" as const },
    ],
    outputs: [
      {
        name: "",
        type: "tuple" as const,
        components: [
          { name: "position", type: "uint8" as const },
          { name: "amount", type: "uint256" as const },
          { name: "claimed", type: "bool" as const },
        ],
      },
    ],
    stateMutability: "view" as const,
  },
] as const;

/**
 * Hook to fetch paginated round history for a token.
 * Fetches rounds in reverse chronological order (newest first).
 * Optionally fetches user bets if userAddress is provided.
 */
export function useRoundHistory(
  tokenAddress: string,
  currentEpoch: bigint | undefined,
  page: number,
  userAddress?: string,
) {
  const { data: predictionContract } = useDeployedContractInfo("BankrBetsPrediction");
  const contractAddress = predictionContract?.address;

  const totalRounds = currentEpoch !== undefined ? Number(currentEpoch) : 0;
  const totalPages = Math.max(1, Math.ceil(totalRounds / PAGE_SIZE));

  // Compute epoch range for this page (newest first)
  const epochs = useMemo(() => {
    if (!currentEpoch || currentEpoch === 0n) return [];
    const epochNum = Number(currentEpoch);
    const startEpoch = epochNum - page * PAGE_SIZE;
    const endEpoch = Math.max(1, startEpoch - PAGE_SIZE + 1);
    const result: bigint[] = [];
    for (let e = startEpoch; e >= endEpoch; e--) {
      if (e >= 1) result.push(BigInt(e));
    }
    return result;
  }, [currentEpoch, page]);

  // Batch read: getRound for each epoch
  const roundContracts = useMemo(() => {
    if (!contractAddress || epochs.length === 0) return [];
    return epochs.map(epoch => ({
      address: contractAddress,
      abi: getRoundAbi,
      functionName: "getRound" as const,
      args: [tokenAddress as `0x${string}`, epoch] as const,
    }));
  }, [contractAddress, epochs, tokenAddress]);

  // Batch read: getUserBet for each epoch (only if user is connected)
  const betContracts = useMemo(() => {
    if (!contractAddress || !userAddress || epochs.length === 0) return [];
    return epochs.map(epoch => ({
      address: contractAddress,
      abi: getUserBetAbi,
      functionName: "getUserBet" as const,
      args: [tokenAddress as `0x${string}`, epoch, userAddress as `0x${string}`] as const,
    }));
  }, [contractAddress, epochs, tokenAddress, userAddress]);

  const {
    data: roundResults,
    isLoading: roundsLoading,
    refetch: refetchRounds,
  } = useReadContracts({
    contracts: roundContracts,
    query: {
      enabled: roundContracts.length > 0,
      refetchInterval: page === 0 ? 5000 : false,
    },
  });

  const {
    data: betResults,
    isLoading: betsLoading,
    refetch: refetchBets,
  } = useReadContracts({
    contracts: betContracts,
    query: {
      enabled: betContracts.length > 0,
      refetchInterval: page === 0 ? 5000 : false,
    },
  });

  // Combine round data with user bets
  const entries: RoundHistoryEntry[] = useMemo(() => {
    return epochs.map((epoch, i) => {
      const roundResult = roundResults?.[i];
      const betResult = betResults?.[i];

      const round =
        roundResult?.status === "success" && roundResult.result ? (roundResult.result as unknown as RoundData) : null;

      const rawBet =
        betResult?.status === "success" && betResult.result ? (betResult.result as unknown as BetData) : null;

      // Only include bet if user actually bet (amount > 0)
      const userBet = rawBet && rawBet.amount > 0n ? rawBet : null;

      return { epoch, round, userBet };
    });
  }, [epochs, roundResults, betResults]);

  return {
    entries,
    totalPages,
    totalRounds,
    isLoading: roundsLoading || (!!userAddress && betsLoading),
    pageSize: PAGE_SIZE,
    refetch: () => {
      void refetchRounds();
      void refetchBets();
    },
  };
}
