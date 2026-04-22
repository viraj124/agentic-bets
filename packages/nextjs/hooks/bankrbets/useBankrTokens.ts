import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { EnrichedToken } from "~~/app/api/bankr-tokens/route";

const PAGE_SIZE = 10; // tokens visible per "page" in the UI
const MAX_TOKENS = 40; // hard cap on tokens surfaced in the feed
const LS_KEY = "bankr-tokens-cache";

export interface BankrToken {
  id: number;
  name: string;
  symbol: string;
  contractAddress: string;
  poolId: string;
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
  if (value >= 1) return `$${value.toFixed(0)}`;
  if (value > 0) return "<$1";
  return "$0";
}

// ── Transform server data to UI format ───────────────────────────────

function toBankrToken(t: EnrichedToken, id: number): BankrToken {
  return {
    id,
    name: t.name,
    symbol: t.symbol,
    contractAddress: t.address,
    poolId: t.poolId,
    imgUrl: t.imgUrl,
    deployedAt: t.deployedAt,
    creator: "",
    pair: t.pair,
    type: "clanker_v4",
    priceUsd: t.priceUsd,
    priceFormatted: formatPrice(t.priceUsd),
    change1h: t.change1h,
    change24h: t.change24h,
    marketCap: t.marketCap,
    marketCapFormatted: formatCompact(t.marketCap),
    volume24h: t.volume24h,
    volumeFormatted: formatCompact(t.volume24h),
    topPoolAddress: t.topPoolAddress,
  };
}

// ── Main hook ───────────────────────────────────────────────────────

export function useBankrTokens() {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const {
    data: allTokens,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["bankr-enriched-tokens"],
    queryFn: async (): Promise<BankrToken[]> => {
      const res = await fetch("/api/bankr-tokens");
      if (!res.ok) return [];
      const json = (await res.json()) as { tokens?: EnrichedToken[] };
      const tokens = (json.tokens || []).map((t, i) => toBankrToken(t, i));
      // Only cache tokens that have real volume data (>= $1 so they don't show "$0")
      const withVolume = tokens.filter(t => t.volume24h > 0);
      if (withVolume.length > 0) {
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(withVolume));
        } catch {
          /* quota exceeded — ignore */
        }
      }
      return tokens;
    },
    // Seed from localStorage so tokens render before the API responds
    initialData: () => {
      if (typeof window === "undefined") return undefined;
      try {
        const cached = localStorage.getItem(LS_KEY);
        if (!cached) return undefined;
        return JSON.parse(cached) as BankrToken[];
      } catch {
        return undefined;
      }
    },
    initialDataUpdatedAt: 0, // treat localStorage data as stale — triggers immediate fetch
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: query => {
      const data = query.state.data;
      return !data || data.length === 0 ? 10_000 : 5 * 60_000;
    },
  });

  // Hide tokens that display "$0" volume — they'll appear once background refresh populates real data
  // Cap at MAX_TOKENS so the feed only surfaces the top slice of the ranked list.
  const allData = useMemo(() => (allTokens || []).filter(t => t.volume24h > 0).slice(0, MAX_TOKENS), [allTokens]);
  const tokens = useMemo(() => allData.slice(0, visibleCount), [allData, visibleCount]);

  const totalCount = allData.length;
  const hasNextPage = visibleCount < totalCount;

  const fetchNextPage = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + PAGE_SIZE, totalCount));
  }, [totalCount]);

  return useMemo(
    () => ({
      data: tokens,
      allData,
      isLoading,
      isFetching,
      hasNextPage,
      fetchNextPage,
      totalCount,
    }),
    [tokens, allData, isLoading, isFetching, hasNextPage, fetchNextPage, totalCount],
  );
}
