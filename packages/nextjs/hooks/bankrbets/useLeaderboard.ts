import { useQuery } from "@tanstack/react-query";

export interface LeaderboardEntry {
  address: string;
  totalBets: number;
  totalWagered: number;
  totalWon: number;
  netPnL: number;
  wins: number;
  winRate: number;
}

type UseLeaderboardOptions = {
  address?: string;
  watch?: boolean;
};

export function useLeaderboard({ watch = false }: UseLeaderboardOptions = {}) {
  const query = useQuery<{ leaderboard?: LeaderboardEntry[]; updatedAt?: number }>({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: watch ? 15_000 : 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    placeholderData: previous => previous,
    refetchInterval: watch ? 2 * 60_000 : false,
    refetchOnWindowFocus: false,
  });

  return {
    leaderboard: Array.isArray(query.data?.leaderboard) ? query.data!.leaderboard : [],
    isLoading: query.isLoading,
    updatedAt: typeof query.data?.updatedAt === "number" ? query.data.updatedAt : 0,
  };
}
