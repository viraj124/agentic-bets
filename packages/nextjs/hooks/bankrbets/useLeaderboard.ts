import { useScaffoldEventHistory } from "~~/hooks/scaffold-eth";

interface LeaderboardEntry {
  address: string;
  totalBets: number;
  totalWagered: number;
  totalWon: number;
  netPnL: number;
  wins: number;
  winRate: number;
}

/**
 * Hook to build a leaderboard from contract events
 * Reads BetBull, BetBear, and Claim events
 */
export function useLeaderboard() {
  const { data: bullEvents, isLoading: bullLoading } = useScaffoldEventHistory({
    contractName: "BankrBetsPrediction",
    eventName: "BetBull",
    fromBlock: 0n,
    watch: true,
  });

  const { data: bearEvents, isLoading: bearLoading } = useScaffoldEventHistory({
    contractName: "BankrBetsPrediction",
    eventName: "BetBear",
    fromBlock: 0n,
    watch: true,
  });

  const { data: claimEvents, isLoading: claimLoading } = useScaffoldEventHistory({
    contractName: "BankrBetsPrediction",
    eventName: "Claim",
    fromBlock: 0n,
    watch: true,
  });

  const isLoading = bullLoading || bearLoading || claimLoading;

  // Aggregate stats per address
  const statsMap = new Map<string, { bets: number; wagered: number; won: number; wins: number }>();

  const getOrCreate = (addr: string) => {
    if (!statsMap.has(addr)) {
      statsMap.set(addr, { bets: 0, wagered: 0, won: 0, wins: 0 });
    }
    return statsMap.get(addr)!;
  };

  // Process bet events
  for (const event of bullEvents || []) {
    const addr = event.args.sender as string;
    const amount = Number(event.args.amount || 0n) / 1e6;
    const stats = getOrCreate(addr);
    stats.bets++;
    stats.wagered += amount;
  }

  for (const event of bearEvents || []) {
    const addr = event.args.sender as string;
    const amount = Number(event.args.amount || 0n) / 1e6;
    const stats = getOrCreate(addr);
    stats.bets++;
    stats.wagered += amount;
  }

  // Process claim events (only non-zero claims = wins)
  for (const event of claimEvents || []) {
    const addr = event.args.sender as string;
    const amount = Number(event.args.amount || 0n) / 1e6;
    if (amount > 0) {
      const stats = getOrCreate(addr);
      stats.won += amount;
      stats.wins++;
    }
  }

  // Build sorted leaderboard
  const leaderboard: LeaderboardEntry[] = Array.from(statsMap.entries())
    .map(([address, stats]) => ({
      address,
      totalBets: stats.bets,
      totalWagered: stats.wagered,
      totalWon: stats.won,
      netPnL: stats.won - stats.wagered,
      wins: stats.wins,
      winRate: stats.bets > 0 ? (stats.wins / stats.bets) * 100 : 0,
    }))
    .sort((a, b) => b.netPnL - a.netPnL);

  return {
    leaderboard,
    isLoading,
  };
}
