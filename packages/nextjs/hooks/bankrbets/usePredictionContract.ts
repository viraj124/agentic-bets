import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
/** 1 hour grace period before a stale round can be marked as refundable */
const REFUND_GRACE_PERIOD_S = 60 * 60;

/**
 * Hook to check if a market has been created for a token.
 * Returns undefined while loading, true if market exists, false if not.
 * Uses BankrBetsOracle.getMarketCreator — returns zero address for unregistered tokens.
 */
export function useMarketCreated(tokenAddress: string) {
  const { data: creator, isLoading } = useScaffoldReadContract({
    contractName: "BankrBetsOracle",
    functionName: "getMarketCreator",
    args: [tokenAddress],
    query: { refetchInterval: 5000 },
    watch: false,
  });

  if (isLoading || creator === undefined) return undefined;
  return (creator as string).toLowerCase() !== ZERO_ADDRESS;
}

/**
 * Hook to read the current round data for a token.
 * Pass enabled=false to skip all RPC calls (e.g. for tokens without markets).
 */
export function useCurrentRound(tokenAddress: string, enabled = true) {
  const { data: currentEpoch } = useScaffoldReadContract({
    contractName: "BankrBetsPrediction",
    functionName: "getCurrentEpoch",
    args: [tokenAddress],
    query: { enabled, refetchInterval: 5000 },
    watch: false,
  });

  const { data: round } = useScaffoldReadContract({
    contractName: "BankrBetsPrediction",
    functionName: "getRound",
    args: [tokenAddress, currentEpoch ?? 0n],
    query: {
      enabled: enabled && currentEpoch !== undefined && currentEpoch > 0n,
      refetchInterval: 5000,
    },
    watch: false,
  });

  return {
    epoch: currentEpoch,
    round,
    isActive: currentEpoch !== undefined && currentEpoch > 0n,
  };
}

/**
 * Hook to read a user's bet for a specific round
 */
export function useUserBet(tokenAddress: string, epoch: bigint | undefined, userAddress: string | undefined) {
  const { data: bet } = useScaffoldReadContract({
    contractName: "BankrBetsPrediction",
    functionName: "getUserBet",
    args: [tokenAddress, epoch ?? 0n, userAddress ?? "0x0000000000000000000000000000000000000000"],
    query: {
      enabled: epoch !== undefined && epoch > 0n && !!userAddress,
      refetchInterval: 5000,
    },
    watch: false,
  });

  return bet;
}

/**
 * Hook to check if a user can claim
 */
export function useClaimable(tokenAddress: string, epoch: bigint | undefined, userAddress: string | undefined) {
  const { data: canClaim } = useScaffoldReadContract({
    contractName: "BankrBetsPrediction",
    functionName: "claimable",
    args: [tokenAddress, epoch ?? 0n, userAddress ?? "0x0000000000000000000000000000000000000000"],
    query: {
      enabled: epoch !== undefined && epoch > 0n && !!userAddress,
      refetchInterval: 5000,
    },
    watch: false,
  });

  return canClaim;
}

/**
 * Hook to place bets, claim winnings, and trigger refunds
 */
export function usePredictionActions() {
  const { writeContractAsync: writeBetBull, isPending: isBettingBull } =
    useScaffoldWriteContract("BankrBetsPrediction");
  const { writeContractAsync: writeBetBear, isPending: isBettingBear } =
    useScaffoldWriteContract("BankrBetsPrediction");
  const { writeContractAsync: writeClaim, isPending: isClaiming } = useScaffoldWriteContract("BankrBetsPrediction");
  const { writeContractAsync: writeRefund, isPending: isRefunding } = useScaffoldWriteContract("BankrBetsPrediction");

  const betBull = async (token: string, amount: bigint) => {
    return writeBetBull({
      functionName: "betBull",
      args: [token, amount],
    });
  };

  const betBear = async (token: string, amount: bigint) => {
    return writeBetBear({
      functionName: "betBear",
      args: [token, amount],
    });
  };

  const claim = async (token: string, epochs: bigint[]) => {
    return writeClaim({
      functionName: "claim",
      args: [token, epochs],
    });
  };

  const refundRound = async (token: string, epoch: bigint) => {
    return writeRefund({
      functionName: "refundRound",
      args: [token, epoch],
    });
  };

  return {
    betBull,
    betBear,
    claim,
    refundRound,
    isBettingBull,
    isBettingBear,
    isClaiming,
    isRefunding,
  };
}

/**
 * Hook to get user's round history
 */
export function useUserRounds(tokenAddress: string, userAddress: string | undefined) {
  const { data: rounds } = useScaffoldReadContract({
    contractName: "BankrBetsPrediction",
    functionName: "getUserRounds",
    args: [tokenAddress, userAddress ?? "0x0000000000000000000000000000000000000000"],
    query: {
      enabled: !!userAddress,
    },
    watch: false,
  });

  return rounds;
}

/**
 * Hook for settlement actions — callable by anyone to earn 0.1% reward
 */
export function useSettlementActions() {
  const { writeContractAsync: writeLock, isPending: isLocking } = useScaffoldWriteContract("BankrBetsPrediction");
  const { writeContractAsync: writeClose, isPending: isClosing } = useScaffoldWriteContract("BankrBetsPrediction");
  const { writeContractAsync: writeStart, isPending: isStarting } = useScaffoldWriteContract("BankrBetsPrediction");

  const lockRound = async (token: string) => {
    return writeLock({ functionName: "lockRound", args: [token] });
  };

  const closeRound = async (token: string) => {
    return writeClose({ functionName: "closeRound", args: [token] });
  };

  const startRound = async (token: string) => {
    return writeStart({ functionName: "startRound", args: [token] });
  };

  return {
    lockRound,
    closeRound,
    startRound,
    isLocking,
    isClosing,
    isStarting,
  };
}

/**
 * Hook to detect refund eligibility for the current round.
 * canTriggerRefund — anyone can call refundRound() to mark it cancelled.
 * roundCancelled   — round is already cancelled; bettors can claim() to get USDC back.
 */
export function useRefundStatus(tokenAddress: string) {
  const { epoch, round } = useCurrentRound(tokenAddress);
  const now = Math.floor(Date.now() / 1000);

  const canTriggerRefund = !!(
    round &&
    !round.oracleCalled &&
    Number(round.closeTimestamp) > 0 &&
    now >= Number(round.closeTimestamp) + REFUND_GRACE_PERIOD_S
  );

  const roundCancelled = !!(round && round.cancelled);

  return { epoch, canTriggerRefund, roundCancelled };
}

/**
 * Hook to read a market creator's accumulated USDC earnings from their markets.
 * Shows the total lifetime creator fee (0.5% per settled round pool).
 */
export function useCreatorEarnings(tokenAddress: string) {
  const { data: creator } = useScaffoldReadContract({
    contractName: "BankrBetsOracle",
    functionName: "getMarketCreator",
    args: [tokenAddress],
    query: {
      refetchInterval: 15000,
    },
    watch: false,
  });

  const { data: earnings } = useScaffoldReadContract({
    contractName: "BankrBetsPrediction",
    functionName: "creatorEarnings",
    args: [creator as `0x${string}`],
    query: {
      enabled: !!creator && (creator as string).toLowerCase() !== ZERO_ADDRESS,
      refetchInterval: 10000,
    },
    watch: false,
  });

  return {
    creator: creator as string | undefined,
    earnings: earnings as bigint | undefined,
    earningsFormatted: earnings ? (Number(earnings as bigint) / 1e6).toFixed(2) : "0.00",
  };
}

/**
 * Hook to read settlement eligibility for frontend "Settle" button
 */
export function useSettlementStatus(tokenAddress: string) {
  const { data: lockable } = useScaffoldReadContract({
    contractName: "BankrBetsPrediction",
    functionName: "isLockable",
    args: [tokenAddress],
    query: {
      refetchInterval: 3000,
    },
    watch: false,
  });

  const { data: closable } = useScaffoldReadContract({
    contractName: "BankrBetsPrediction",
    functionName: "isClosable",
    args: [tokenAddress],
    query: {
      refetchInterval: 3000,
    },
    watch: false,
  });

  const { data: settlerReward } = useScaffoldReadContract({
    contractName: "BankrBetsPrediction",
    functionName: "getSettlerReward",
    args: [tokenAddress],
    query: {
      refetchInterval: 5000,
    },
    watch: false,
  });

  return {
    isLockable: !!lockable,
    isClosable: !!closable,
    settlerReward: settlerReward ? Number(settlerReward) / 1e6 : 0,
  };
}
