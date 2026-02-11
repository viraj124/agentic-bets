import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

const GECKO_BASE = "https://api.geckoterminal.com/api/v2/networks/base";
const TOKENS_ENDPOINT = `${GECKO_BASE}/tokens/multi`;
const PAGE_SIZE = 30; // GeckoTerminal max per request

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
  const subscripts = "\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089";
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

// ── Server-side address resolver (cached in API route) ─────────────

async function fetchAddressesFromServer(): Promise<string[]> {
  const res = await fetch("/api/bankr-tokens");
  if (!res.ok) return [];
  const json = (await res.json()) as { addresses?: string[] };
  return (json.addresses || []).map(addr => addr.toLowerCase());
}

// ── Fetch one page of token data from GeckoTerminal ─────────────────

async function fetchTokenPage(
  addresses: string[],
  pageIndex: number,
): Promise<{ tokens: BankrToken[]; nextPage: number | undefined }> {
  const start = pageIndex * PAGE_SIZE;
  const chunk = addresses.slice(start, start + PAGE_SIZE);
  if (chunk.length === 0) return { tokens: [], nextPage: undefined };

  const res = await fetch(`${TOKENS_ENDPOINT}/${chunk.join(",")}?include=top_pools`);
  if (!res.ok) return { tokens: [], nextPage: undefined };
  const json = await res.json();

  const tokens: BankrToken[] = [];

  // Build pool data map from "included" array
  const poolMap = new Map<
    string,
    { address: string; change1h: number; change24h: number; createdAt: string; poolName: string }
  >();
  for (const item of json.included || []) {
    if (item.type === "pool") {
      const a = item.attributes;
      poolMap.set(item.id, {
        address: (a.address || "").toLowerCase(),
        change1h: parseFloat(a.price_change_percentage?.h1 || "0"),
        change24h: parseFloat(a.price_change_percentage?.h24 || "0"),
        createdAt: a.pool_created_at || "",
        poolName: a.name || "",
      });
    }
  }

  for (const t of json.data || []) {
    const a = t.attributes;
    const addr = (a.address || "").toLowerCase();
    if (!addr) continue;

    const priceUsd = parseFloat(a.price_usd || "0");
    const marketCap = parseFloat(a.market_cap_usd || "0") || parseFloat(a.fdv_usd || "0");
    const volume24h = parseFloat(a.volume_usd?.h24 || "0");

    const topPoolRef = t.relationships?.top_pools?.data?.[0];
    const pool = topPoolRef ? poolMap.get(topPoolRef.id) : undefined;

    tokens.push({
      id: 0,
      name: a.name || "",
      symbol: a.symbol || "",
      contractAddress: addr,
      imgUrl: a.image_url || "",
      deployedAt: pool?.createdAt || "",
      creator: "",
      pair: pool?.poolName?.includes("USDC") ? "USDC" : "WETH",
      type: "clanker_v4",
      priceUsd,
      priceFormatted: formatPrice(priceUsd),
      change1h: pool?.change1h || 0,
      change24h: pool?.change24h || 0,
      marketCap,
      marketCapFormatted: formatCompact(marketCap),
      volume24h,
      volumeFormatted: formatCompact(volume24h),
      topPoolAddress: pool?.address || "",
    });
  }

  const hasMore = start + PAGE_SIZE < addresses.length;
  return { tokens, nextPage: hasMore ? pageIndex + 1 : undefined };
}

// ── Main hook ───────────────────────────────────────────────────────

export function useBankrTokens() {
  const addressQuery = useQuery({
    queryKey: ["bankr-addresses"],
    queryFn: fetchAddressesFromServer,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 2 * 60_000,
  });

  const addresses = useMemo(() => {
    const list = addressQuery.data || [];
    return list.length > 0 ? list : undefined;
  }, [addressQuery.data]);

  const tokenQuery = useInfiniteQuery({
    queryKey: ["bankr-tokens", addresses],
    queryFn: ({ pageParam }) => fetchTokenPage(addresses!, pageParam),
    initialPageParam: 0,
    getNextPageParam: lastPage => lastPage.nextPage,
    enabled: !!addresses && addresses.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Flatten pages, filter $0 tokens, sort by market cap, assign IDs
  const tokens = useMemo(() => {
    const all = (tokenQuery.data?.pages || []).flatMap(p => p.tokens);
    const list = all.filter(t => t.priceUsd > 0);
    list.sort((a, b) => b.marketCap - a.marketCap);
    list.forEach((t, i) => {
      t.id = i;
    });
    return list;
  }, [tokenQuery.data]);

  return useMemo(
    () => ({
      data: tokens,
      isLoading: addressQuery.isLoading || tokenQuery.isLoading,
      isFetching: tokenQuery.isFetching,
      isFetchingNextPage: tokenQuery.isFetchingNextPage,
      hasNextPage: tokenQuery.hasNextPage,
      fetchNextPage: tokenQuery.fetchNextPage,
    }),
    [
      tokens,
      addressQuery.isLoading,
      tokenQuery.isLoading,
      tokenQuery.isFetching,
      tokenQuery.isFetchingNextPage,
      tokenQuery.hasNextPage,
      tokenQuery.fetchNextPage,
    ],
  );
}
