import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PublicSeasonConfig, WalletPoints } from "~~/utils/bankrbets/seasonPoints";
import type { DerivedUserStats } from "~~/utils/bankrbets/server/derivedStats";

const LS_KEY_PREFIX = "bankr-leaderboard-cache:";

export type LeaderboardMode = "season" | "all-time";
export type SeasonLeaderboardEntry = WalletPoints;
export type AllTimeLeaderboardEntry = DerivedUserStats;

type SeasonLeaderboardData = {
  mode: "season";
  leaderboard?: SeasonLeaderboardEntry[];
  season?: PublicSeasonConfig;
  updatedAt?: number;
};

type AllTimeLeaderboardData = {
  mode: "all-time";
  leaderboard?: AllTimeLeaderboardEntry[];
  updatedAt?: number;
};

type LeaderboardData = SeasonLeaderboardData | AllTimeLeaderboardData;

type UseLeaderboardOptions = {
  mode?: LeaderboardMode;
  watch?: boolean;
};

export function useLeaderboard({ mode = "season", watch = false }: UseLeaderboardOptions = {}) {
  const queryClient = useQueryClient();
  const lsKey = `${LS_KEY_PREFIX}${mode}`;

  const query = useQuery<LeaderboardData>({
    queryKey: ["leaderboard", mode],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard?mode=${mode}`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as LeaderboardData;
      try {
        localStorage.setItem(lsKey, JSON.stringify(data));
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
    if (queryClient.getQueryData(["leaderboard", mode])) return;
    try {
      const cached = localStorage.getItem(lsKey);
      if (!cached) return;
      queryClient.setQueryData(["leaderboard", mode], JSON.parse(cached) as LeaderboardData);
    } catch {
      // ignore corrupted local cache
    }
  }, [queryClient, lsKey, mode]);

  return {
    data: query.data,
    isLoading: query.isLoading,
    updatedAt: typeof query.data?.updatedAt === "number" ? query.data.updatedAt : 0,
  };
}
