import { useQuery } from "@tanstack/react-query";

export interface LivePriceData {
  priceUsd: number;
  source: "gecko-pool" | "dexscreener-token" | "gecko-token-pools" | "zerox-price";
  updatedAt: number;
  ageMs: number;
  isStale: boolean;
  isDelayed: boolean;
  poolAddress?: string;
  tokenAddress?: string;
}

export function useLivePrice(poolAddress?: string, tokenAddress?: string) {
  return useQuery({
    queryKey: ["live-price", poolAddress, tokenAddress],
    queryFn: async (): Promise<LivePriceData> => {
      const params = new URLSearchParams();
      if (poolAddress) params.set("pool", poolAddress);
      if (tokenAddress) params.set("token", tokenAddress);

      const res = await fetch(`/api/live-price?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Live price request failed: ${res.status}`);
      }
      const json = (await res.json()) as LivePriceData;
      return json;
    },
    enabled: Boolean(poolAddress || tokenAddress),
    staleTime: 1000,
    retry: 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 4000),
    refetchInterval: query => (query.state.data?.isDelayed ? 3000 : 2000),
    refetchOnWindowFocus: false,
    placeholderData: previousData => previousData,
  });
}
