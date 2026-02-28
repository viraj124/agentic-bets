import { useQuery } from "@tanstack/react-query";

const GECKO_BASE_URL = "https://api.geckoterminal.com/api/v2/networks/base/pools";
const GECKO_TOKENS_URL = "https://api.geckoterminal.com/api/v2/networks/base/tokens";
const DEXSCREENER_TOKENS_URL = "https://api.dexscreener.com/latest/dex/tokens";
const RESOLVED_POOL_TTL_MS = 10 * 60_000;
const resolvedPoolCache = new Map<string, { pool: string; ts: number }>();

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

function isHexAddress(value: string): boolean {
  return /^0x[a-f0-9]{40}$/.test(value);
}

function isHexBytes32(value: string): boolean {
  return /^0x[a-f0-9]{64}$/.test(value);
}

function extractAddressFromGeckoId(id: string): string {
  if (!id) return "";
  for (const part of id.split("_")) {
    const lower = part.toLowerCase();
    if (isHexAddress(lower) || isHexBytes32(lower)) return lower;
  }
  return "";
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

function toPoolData(attrs: any, poolAddress: string): PoolData {
  const priceUsd = toNumber(attrs?.base_token_price_usd);
  const marketCap = toNumber(attrs?.market_cap_usd) || toNumber(attrs?.fdv_usd);
  const volume24h = toNumber(attrs?.volume_usd?.h24);
  const change1h = toNumber(attrs?.price_change_percentage?.h1);

  return {
    priceUsd,
    priceFormatted: formatPrice(priceUsd),
    change1h,
    marketCap,
    marketCapFormatted: formatMarketCap(marketCap),
    volume24h,
    poolAddress,
    tokenName: attrs?.name || "",
    tokenSymbol: "",
  };
}

async function fetchPoolData(poolAddress: string): Promise<PoolData | null> {
  const res = await fetch(`${GECKO_BASE_URL}/${poolAddress}`);
  if (!res.ok) return null;
  const json = await res.json();
  const attrs = json?.data?.attributes;
  if (!attrs) return null;
  return toPoolData(attrs, poolAddress);
}

function toDexPairPoolData(pair: any): PoolData | null {
  const poolAddress = (pair?.pairAddress || "").toLowerCase();
  if (!poolAddress || (!isHexAddress(poolAddress) && !isHexBytes32(poolAddress))) return null;

  const priceUsd = toNumber(pair?.priceUsd);
  const marketCap = toNumber(pair?.marketCap) || toNumber(pair?.fdv);
  const volume24h = toNumber(pair?.volume?.h24);
  const change1h = toNumber(pair?.priceChange?.h1);
  const baseSymbol = pair?.baseToken?.symbol || "";
  const quoteSymbol = pair?.quoteToken?.symbol || "USD";

  return {
    priceUsd,
    priceFormatted: formatPrice(priceUsd),
    change1h,
    marketCap,
    marketCapFormatted: formatMarketCap(marketCap),
    volume24h,
    poolAddress,
    tokenName: baseSymbol ? `${baseSymbol}/${quoteSymbol}` : pair?.baseToken?.name || "",
    tokenSymbol: baseSymbol,
  };
}

async function fetchDexScreenerPoolData(tokenAddress: string, preferredPoolAddress?: string): Promise<PoolData | null> {
  if (!tokenAddress || !isHexAddress(tokenAddress)) return null;

  const res = await fetch(`${DEXSCREENER_TOKENS_URL}/${tokenAddress}`);
  if (!res.ok) return null;
  const json = await res.json();
  const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
  if (pairs.length === 0) return null;

  const preferred = (preferredPoolAddress || "").toLowerCase();
  let bestPair: any = null;
  let bestScore = -1;

  for (const pair of pairs) {
    if ((pair?.chainId || "").toLowerCase() !== "base") continue;
    const candidateAddress = (pair?.pairAddress || "").toLowerCase();
    if (!candidateAddress) continue;

    if (preferred && candidateAddress === preferred) {
      bestPair = pair;
      break;
    }

    const score = toNumber(pair?.volume?.h24) + toNumber(pair?.liquidity?.usd) * 0.1;
    if (score > bestScore) {
      bestScore = score;
      bestPair = pair;
    }
  }

  if (!bestPair) return null;
  return toDexPairPoolData(bestPair);
}

async function resolveBestPoolForToken(tokenAddress: string): Promise<string | null> {
  const cached = resolvedPoolCache.get(tokenAddress);
  if (cached && Date.now() - cached.ts < RESOLVED_POOL_TTL_MS) {
    return cached.pool || null;
  }

  const res = await fetch(`${GECKO_TOKENS_URL}/${tokenAddress}/pools`);
  if (!res.ok) return null;
  const json = await res.json();
  const pools = Array.isArray(json?.data) ? json.data : [];

  let bestPool = "";
  let bestScore = -1;
  for (const pool of pools) {
    const address =
      (pool?.attributes?.address || "").toLowerCase() || extractAddressFromGeckoId((pool?.id || "").toLowerCase());
    if (!isHexAddress(address) && !isHexBytes32(address)) continue;

    const score = toNumber(pool?.attributes?.volume_usd?.h24);
    if (score > bestScore) {
      bestPool = address;
      bestScore = score;
    }
  }

  resolvedPoolCache.set(tokenAddress, { pool: bestPool, ts: Date.now() });
  return bestPool || null;
}

export function useGeckoTerminal(poolAddress: string | undefined, tokenAddress?: string) {
  return useQuery({
    queryKey: ["gecko-pool", poolAddress, tokenAddress],
    queryFn: async (): Promise<PoolData> => {
      const normalizedPool = (poolAddress || "").toLowerCase();
      const normalizedToken = (tokenAddress || "").toLowerCase();
      let geckoData: PoolData | null = null;

      if (normalizedToken && isHexAddress(normalizedToken)) {
        const cachedResolvedPool = resolvedPoolCache.get(normalizedToken);
        if (
          cachedResolvedPool &&
          Date.now() - cachedResolvedPool.ts < RESOLVED_POOL_TTL_MS &&
          cachedResolvedPool.pool &&
          cachedResolvedPool.pool !== normalizedPool
        ) {
          geckoData = await fetchPoolData(cachedResolvedPool.pool);
          if (geckoData) return geckoData;
        }
      }

      if (!geckoData && normalizedPool && (isHexAddress(normalizedPool) || isHexBytes32(normalizedPool))) {
        geckoData = await fetchPoolData(normalizedPool);
        if (geckoData) return geckoData;
      }

      if (!geckoData && normalizedToken && isHexAddress(normalizedToken)) {
        const resolvedPool = await resolveBestPoolForToken(normalizedToken);
        if (resolvedPool) {
          geckoData = await fetchPoolData(resolvedPool);
          if (geckoData) return geckoData;
        }
      }

      // Gecko can intermittently 429. Use DexScreener fallback for resilient live price updates.
      if (normalizedToken && isHexAddress(normalizedToken)) {
        const dexData = await fetchDexScreenerPoolData(normalizedToken, normalizedPool);
        if (dexData) return dexData;
      }

      throw new Error("Failed to fetch pool data");
    },
    enabled: !!poolAddress || !!tokenAddress,
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
