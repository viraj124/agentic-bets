import { useQuery } from "@tanstack/react-query";

export interface PoolData {
  priceUsd: number;
  priceFormatted: string;
  change1h: number;
  marketCap: number;
  marketCapFormatted: string;
  volume24h: number;
  poolAddress: string;
  tokenName: string;
  tokenSymbol: string;
}

/**
 * Format price with smart decimal handling for small-cap tokens
 * e.g., $0.00000638 becomes "$0.0₅638"
 */
function formatPrice(price: number): string {
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  if (price === 0) return "$0.00";

  const str = price.toFixed(20);
  const match = str.match(/^0\.(0+)/);
  if (!match) return `$${price.toFixed(6)}`;

  const zeros = match[1].length;
  const significantDigits = str.slice(2 + zeros, 2 + zeros + 3);
  return `$0.0${subscriptNumber(zeros)}${significantDigits}`;
}

function subscriptNumber(n: number): string {
  const subscripts = "₀₁₂₃₄₅₆₇₈₉";
  return String(n)
    .split("")
    .map(d => subscripts[parseInt(d)])
    .join("");
}

function formatMarketCap(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function toPoolData(raw: any): PoolData {
  return {
    priceUsd: raw.priceUsd ?? 0,
    priceFormatted: formatPrice(raw.priceUsd ?? 0),
    change1h: raw.change1h ?? 0,
    marketCap: raw.marketCap ?? 0,
    marketCapFormatted: formatMarketCap(raw.marketCap ?? 0),
    volume24h: raw.volume24h ?? 0,
    poolAddress: raw.poolAddress ?? "",
    tokenName: raw.tokenName ?? "",
    tokenSymbol: raw.tokenSymbol ?? "",
  };
}

export function useGeckoTerminal(poolAddress: string | undefined, tokenAddress?: string) {
  return useQuery({
    queryKey: ["gecko-pool", poolAddress, tokenAddress],
    queryFn: async (): Promise<PoolData> => {
      const params = new URLSearchParams();
      if (poolAddress) params.set("pool", poolAddress.toLowerCase());
      if (tokenAddress) params.set("token", tokenAddress.toLowerCase());

      const res = await fetch(`/api/pool-data?${params.toString()}`);
      if (!res.ok) throw new Error(`Pool data request failed: ${res.status}`);
      const raw = await res.json();
      return toPoolData(raw);
    },
    enabled: !!poolAddress || !!tokenAddress,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
    retryDelay: attemptIndex => Math.min(2000 * 2 ** attemptIndex, 10_000),
    refetchOnWindowFocus: false,
    placeholderData: previousData => previousData,
  });
}

export function useGeckoTerminalMulti(poolAddresses: string[]) {
  return useQuery({
    queryKey: ["gecko-pools-multi", poolAddresses.join(",")],
    queryFn: async (): Promise<PoolData[]> => {
      if (poolAddresses.length === 0) return [];

      const params = new URLSearchParams({ pools: poolAddresses.join(",") });
      const res = await fetch(`/api/pool-data?${params.toString()}`);
      if (!res.ok) throw new Error(`Multi pool data request failed: ${res.status}`);
      const rawList = await res.json();
      if (!Array.isArray(rawList)) return [];
      return rawList.map(toPoolData);
    },
    enabled: poolAddresses.length > 0,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
    retryDelay: attemptIndex => Math.min(2000 * 2 ** attemptIndex, 10_000),
    refetchOnWindowFocus: false,
    placeholderData: previousData => previousData,
  });
}
