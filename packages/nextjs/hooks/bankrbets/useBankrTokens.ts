import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

const GECKO_BASE = "https://api.geckoterminal.com/api/v2/networks/base";
const POOLS_ENDPOINT = `${GECKO_BASE}/dexes/uniswap-v4-base/pools`;
const TOKENS_ENDPOINT = `${GECKO_BASE}/tokens/multi`;
const AGENTS_REGISTRY_URL = "https://raw.githubusercontent.com/BankrBot/tokenized-agents/main/AGENTS.md";

export interface BankrToken {
  id: number;
  name: string;
  symbol: string;
  contractAddress: string;
  imgUrl: string;
  deployedAt: string;
  creator: string;
  pair: string;
  type: string;
  priceUsd: number;
  priceFormatted: string;
  change1h: number;
  change24h: number;
  marketCap: number;
  marketCapFormatted: string;
  volume24h: number;
  volumeFormatted: string;
  topPoolAddress: string;
  isBankrToken?: boolean;
}

// ── Formatting ──────────────────────────────────────────────────────

function formatPrice(price: number): string {
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  if (price === 0) return "$0.00";

  const str = price.toFixed(20);
  const match = str.match(/^0\.(0+)/);
  if (!match) return `$${price.toFixed(6)}`;

  const zeros = match[1].length;
  const subscripts = "₀₁₂₃₄₅₆₇₈₉";
  const sub = String(zeros)
    .split("")
    .map(d => subscripts[parseInt(d)])
    .join("");
  const sig = str.slice(2 + zeros, 2 + zeros + 3);
  return `$0.0${sub}${sig}`;
}

function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value > 0) return `$${value.toFixed(0)}`;
  return "$0";
}

// ── Bankr token identification (background, cached long) ────────────

async function fetchBankrAddresses(): Promise<string[]> {
  const addresses = new Set<string>();

  try {
    const res = await fetch(AGENTS_REGISTRY_URL);
    if (res.ok) {
      const md = await res.text();
      for (const line of md.split("\n")) {
        const match = line.match(/`(0x[a-fA-F0-9]{40})`/);
        if (match) addresses.add(match[1].toLowerCase());
      }
    }
  } catch {
    /* optional */
  }

  return Array.from(addresses);
}

// ── GeckoTerminal data fetching ─────────────────────────────────────

interface PoolData {
  poolAddress: string;
  baseTokenAddress: string;
  poolName: string;
  priceUsd: number;
  marketCap: number;
  fdv: number;
  volume24h: number;
  change1h: number;
  change24h: number;
  createdAt: string;
}

async function fetchPoolPage(page: number): Promise<PoolData[]> {
  const res = await fetch(`${POOLS_ENDPOINT}?page=${page}`);
  if (!res.ok) return [];
  const json = await res.json();
  const pools: PoolData[] = [];
  const zeroAddr = "0x" + "0".repeat(40);

  for (const p of json.data || []) {
    const a = p.attributes;
    const baseId = p.relationships?.base_token?.data?.id || "";
    const baseAddr = baseId.replace("base_", "").toLowerCase();
    if (!baseAddr || baseAddr === zeroAddr) continue;

    pools.push({
      poolAddress: a.address || "",
      baseTokenAddress: baseAddr,
      poolName: a.name || "",
      priceUsd: parseFloat(a.base_token_price_usd || "0"),
      marketCap: parseFloat(a.market_cap_usd || "0"),
      fdv: parseFloat(a.fdv_usd || "0"),
      volume24h: parseFloat(a.volume_usd?.h24 || "0"),
      change1h: parseFloat(a.price_change_percentage?.h1 || "0"),
      change24h: parseFloat(a.price_change_percentage?.h24 || "0"),
      createdAt: a.pool_created_at || "",
    });
  }

  return pools;
}

async function fetchTokenMeta(
  addresses: string[],
): Promise<Record<string, { name: string; symbol: string; imgUrl: string }>> {
  const meta: Record<string, { name: string; symbol: string; imgUrl: string }> = {};
  if (addresses.length === 0) return meta;

  // GeckoTerminal accepts up to 30 addresses per call
  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += 30) {
    chunks.push(addresses.slice(i, i + 30));
  }

  await Promise.all(
    chunks.map(async chunk => {
      try {
        const res = await fetch(`${TOKENS_ENDPOINT}/${chunk.join(",")}`);
        if (!res.ok) return;
        const json = await res.json();
        for (const t of json.data || []) {
          const a = t.attributes;
          const addr = (a.address || "").toLowerCase();
          if (addr) {
            meta[addr] = {
              name: a.name || "",
              symbol: a.symbol || "",
              imgUrl: a.image_url || "",
            };
          }
        }
      } catch {
        /* continue */
      }
    }),
  );

  return meta;
}

// ── Page fetcher (returns BankrToken[] for a single page) ───────────

async function fetchPage(page: number): Promise<{ tokens: BankrToken[]; hasMore: boolean }> {
  const pools = await fetchPoolPage(page);
  if (pools.length === 0) return { tokens: [], hasMore: false };

  // Deduplicate within page by token address (keep highest volume pool)
  const bestPool = new Map<string, PoolData>();
  for (const pool of pools) {
    const existing = bestPool.get(pool.baseTokenAddress);
    if (!existing || pool.volume24h > existing.volume24h) {
      bestPool.set(pool.baseTokenAddress, pool);
    }
  }

  const uniquePools = Array.from(bestPool.values());
  const addresses = uniquePools.map(p => p.baseTokenAddress);
  const tokenMeta = await fetchTokenMeta(addresses);

  const tokens: BankrToken[] = uniquePools.map((pool, idx) => {
    const meta = tokenMeta[pool.baseTokenAddress];
    const marketCap = pool.marketCap || pool.fdv;
    const poolSymbol = pool.poolName.split(/\s*\/\s*/)[0]?.trim() || "";

    return {
      id: idx,
      name: meta?.name || poolSymbol,
      symbol: meta?.symbol || poolSymbol,
      contractAddress: pool.baseTokenAddress,
      imgUrl: meta?.imgUrl || "",
      deployedAt: pool.createdAt,
      creator: "",
      pair: pool.poolName.includes("USDC") ? "USDC" : "WETH",
      type: "clanker_v4",
      priceUsd: pool.priceUsd,
      priceFormatted: formatPrice(pool.priceUsd),
      change1h: pool.change1h,
      change24h: pool.change24h,
      marketCap,
      marketCapFormatted: formatCompact(marketCap),
      volume24h: pool.volume24h,
      volumeFormatted: formatCompact(pool.volume24h),
      topPoolAddress: pool.poolAddress,
    };
  });

  return { tokens, hasMore: pools.length >= 10 };
}

// ── Main hook ───────────────────────────────────────────────────────

export function useBankrTokens() {
  // Background: known Bankr addresses (long cache, never blocks UI)
  const { data: bankrAddresses } = useQuery({
    queryKey: ["bankr-addresses"],
    queryFn: fetchBankrAddresses,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  const bankrSet = useMemo(() => new Set(bankrAddresses || []), [bankrAddresses]);

  // Primary: paginated pool data from GeckoTerminal
  const infiniteQuery = useInfiniteQuery({
    queryKey: ["bankr-tokens"],
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      return lastPage.hasMore ? lastPageParam + 1 : undefined;
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 2 * 60_000,
  });

  // Flatten all pages → deduplicated, sorted token list
  const tokens = useMemo(() => {
    const pages = infiniteQuery.data?.pages || [];
    const allTokens = pages.flatMap(p => p.tokens);

    // Deduplicate across pages (a token may appear in multiple pools on different pages)
    const seen = new Map<string, BankrToken>();
    for (const token of allTokens) {
      const existing = seen.get(token.contractAddress);
      if (!existing || token.volume24h > existing.volume24h) {
        seen.set(token.contractAddress, {
          ...token,
          isBankrToken: bankrSet.has(token.contractAddress),
        });
      }
    }

    const list = Array.from(seen.values());
    list.sort((a, b) => b.marketCap - a.marketCap);

    // Re-assign stable IDs after sort
    list.forEach((t, i) => {
      t.id = i;
    });

    return list;
  }, [infiniteQuery.data, bankrSet]);

  return useMemo(
    () => ({
      data: tokens,
      isLoading: infiniteQuery.isLoading,
      isFetching: infiniteQuery.isFetching,
      isFetchingNextPage: infiniteQuery.isFetchingNextPage,
      hasNextPage: infiniteQuery.hasNextPage ?? false,
      fetchNextPage: infiniteQuery.fetchNextPage,
    }),
    [
      tokens,
      infiniteQuery.isLoading,
      infiniteQuery.isFetching,
      infiniteQuery.isFetchingNextPage,
      infiniteQuery.hasNextPage,
      infiniteQuery.fetchNextPage,
    ],
  );
}
