import { useQuery } from "@tanstack/react-query";

const LS_KEY = "bankr-leaderboard-cache";

export interface LeaderboardEntry {
  address: string;
  totalBets: number;
  totalWagered: number;
  totalWon: number;
  netPnL: number;
  wins: number;
  winRate: number;
}

type LeaderboardData = { leaderboard?: LeaderboardEntry[]; updatedAt?: number };

type UseLeaderboardOptions = {
  address?: string;
  watch?: boolean;
};

export function useLeaderboard({ watch = false }: UseLeaderboardOptions = {}) {
  const query = useQuery<LeaderboardData>({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard", {
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Persist for instant load on next visit
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(data));
      } catch { /* ignore */ }
      return data;
    },
    initialData: () => {
      if (typeof window === "undefined") return undefined;
      try {
        const cached = localStorage.getItem(LS_KEY);
        return cached ? (JSON.parse(cached) as LeaderboardData) : undefined;
      } catch { return undefined; }
    },
    initialDataUpdatedAt: 0,
    staleTime: watch ? 15_000 : 60_000,
    gcTime: 10 * 60_000,
    retry: 2,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 5000),
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
