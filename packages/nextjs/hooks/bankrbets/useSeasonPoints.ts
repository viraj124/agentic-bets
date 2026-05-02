import { useQuery } from "@tanstack/react-query";
import type { BetActivityRow, PublicSeasonConfig, WalletPoints } from "~~/utils/bankrbets/seasonPoints";

export type SeasonPointsResponse = {
  wallet: WalletPoints;
  activity: BetActivityRow[];
  rank: number | null;
  season: PublicSeasonConfig;
  updatedAt: number;
};

export function useSeasonPoints(address?: string) {
  const lower = address?.toLowerCase();

  return useQuery<SeasonPointsResponse>({
    queryKey: ["season-1-points", lower],
    enabled: !!lower,
    queryFn: async () => {
      const res = await fetch(`/api/season-1/points?address=${lower}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as SeasonPointsResponse;
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
