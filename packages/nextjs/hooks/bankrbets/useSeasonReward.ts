import { useQuery } from "@tanstack/react-query";
import type { SeasonRewardMeta, SeasonRewardRow } from "~~/utils/bankrbets/seasonReward";

export type SeasonRewardResponse = {
  reward: SeasonRewardRow | null;
  meta: SeasonRewardMeta;
};

export function useSeasonReward(address?: string) {
  const lower = address?.toLowerCase();

  return useQuery<SeasonRewardResponse>({
    queryKey: ["season-1-reward", lower],
    enabled: !!lower,
    queryFn: async () => {
      const res = await fetch(`/api/season-1/reward?address=${lower}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as SeasonRewardResponse;
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
