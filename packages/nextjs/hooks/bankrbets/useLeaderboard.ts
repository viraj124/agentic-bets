import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
  const queryClient = useQueryClient();
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
      } catch {
        /* ignore */
      }
      return data;
    },
    staleTime: watch ? 15_000 : 60_000,
    gcTime: 10 * 60_000,
    retry: 2,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 5000),
    placeholderData: previous => previous,
    refetchInterval: watch ? 2 * 60_000 : false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (queryClient.getQueryData(["leaderboard"])) return;

    try {
      const cached = localStorage.getItem(LS_KEY);
      if (!cached) return;
      queryClient.setQueryData(["leaderboard"], JSON.parse(cached) as LeaderboardData);
    } catch {
      // ignore corrupted local cache
    }
  }, [queryClient]);

  return {
    leaderboard: Array.isArray(query.data?.leaderboard) ? query.data!.leaderboard : [],
    isLoading: query.isLoading,
    updatedAt: typeof query.data?.updatedAt === "number" ? query.data.updatedAt : 0,
  };
}
