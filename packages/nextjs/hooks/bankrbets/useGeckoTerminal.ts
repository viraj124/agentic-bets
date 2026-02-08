import { useQuery } from "@tanstack/react-query";

const GECKO_BASE_URL = "https://api.geckoterminal.com/api/v2/networks/base/pools";

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

export function useGeckoTerminal(poolAddress: string | undefined) {
  return useQuery({
    queryKey: ["gecko-pool", poolAddress],
    queryFn: async (): Promise<PoolData> => {
      const res = await fetch(`${GECKO_BASE_URL}/${poolAddress}`);
      if (!res.ok) throw new Error("Failed to fetch pool data");
      const json = await res.json();
      const attrs = json.data.attributes;

      const priceUsd = parseFloat(attrs.base_token_price_usd || "0");
      const marketCap = parseFloat(attrs.market_cap_usd || "0") || parseFloat(attrs.fdv_usd || "0");
      const volume24h = parseFloat(attrs.volume_usd?.h24 || "0");
      const change1h = parseFloat(attrs.price_change_percentage?.h1 || "0");

      return {
        priceUsd,
        priceFormatted: formatPrice(priceUsd),
        change1h,
        marketCap,
        marketCapFormatted: formatMarketCap(marketCap),
        volume24h,
        poolAddress: poolAddress || "",
        tokenName: attrs.name || "",
        tokenSymbol: "",
      };
    },
    enabled: !!poolAddress,
    refetchInterval: 5000,
    staleTime: 3000,
  });
}

export function useGeckoTerminalMulti(poolAddresses: string[]) {
  return useQuery({
    queryKey: ["gecko-pools-multi", poolAddresses.join(",")],
    queryFn: async (): Promise<PoolData[]> => {
      // GeckoTerminal supports multi-pool queries
      const addresses = poolAddresses.join(",");
      const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/base/pools/multi/${addresses}`);
      if (!res.ok) throw new Error("Failed to fetch pools");
      const json = await res.json();

      return (json.data || []).map((pool: any) => {
        const attrs = pool.attributes;
        const priceUsd = parseFloat(attrs.base_token_price_usd || "0");
        const marketCap = parseFloat(attrs.market_cap_usd || "0") || parseFloat(attrs.fdv_usd || "0");

        return {
          priceUsd,
          priceFormatted: formatPrice(priceUsd),
          change1h: parseFloat(attrs.price_change_percentage?.h1 || "0"),
          marketCap,
          marketCapFormatted: formatMarketCap(marketCap),
          volume24h: parseFloat(attrs.volume_usd?.h24 || "0"),
          poolAddress: attrs.address || pool.id?.split("_")[1] || "",
          tokenName: attrs.name || "",
          tokenSymbol: "",
        };
      });
    },
    enabled: poolAddresses.length > 0,
    refetchInterval: 5000,
    staleTime: 3000,
  });
}
