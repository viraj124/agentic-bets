"use client";

import { useCallback, useMemo, useState } from "react";
import { InfoTooltip } from "./InfoTooltip";
import { type TokenActionLabel, TokenCard } from "./TokenCard";
import { useQuery } from "@tanstack/react-query";
import { useBankrTokens } from "~~/hooks/bankrbets/useBankrTokens";

/** Shared column widths so header labels align with TokenCard data */
const COL_HEADER =
  "hidden sm:flex items-center gap-3 px-4 py-2.5 text-[10px] uppercase tracking-wider text-pg-muted font-bold border-b-2 border-pg-border mb-1";

type MarketStatus = "open" | "locked" | "settled" | "cancelled" | "not_started";
type TokenFilter = "all" | "needsSettlement" | "create" | "highVolume" | "season";

interface MarketFeedItem {
  token: string;
  status: MarketStatus;
  poolUsdc: number;
  contractVersion: "v1" | "v2";
}

interface MarketFeedResponse {
  markets?: MarketFeedItem[];
}

interface TokenActionMeta {
  marketStateKnown: boolean;
  hasMarket: boolean;
  isNeedsSettlement: boolean;
  isHighVolume: boolean;
  isSeasonActive: boolean;
  labels: TokenActionLabel[];
}

const FILTER_LABELS: Record<TokenFilter, string> = {
  all: "All",
  needsSettlement: "Needs settlement",
  create: "Create market",
  highVolume: "High volume",
  season: "Season active",
};

const HIGH_VOLUME_VISIBLE_COUNT = 8;
const EMPTY_META: TokenActionMeta = {
  marketStateKnown: false,
  hasMarket: false,
  isNeedsSettlement: false,
  isHighVolume: false,
  isSeasonActive: false,
  labels: [],
};

export function TrendingTokens() {
  const { data: tokens, allData, isLoading, isFetching, hasNextPage, fetchNextPage, totalCount } = useBankrTokens();
  const { data: marketFeed } = useQuery({
    queryKey: ["bankr-market-feed"],
    queryFn: async (): Promise<MarketFeedItem[]> => {
      const res = await fetch("/api/bankr/markets", { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as MarketFeedResponse;
      return json.markets ?? [];
    },
    staleTime: 10_000,
    gcTime: 60_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const marketByAddress = useMemo(() => {
    const map = new Map<string, MarketFeedItem>();
    (marketFeed ?? []).forEach(market => map.set(market.token.toLowerCase(), market));
    return map;
  }, [marketFeed]);

  const highVolumeAddresses = useMemo(() => {
    const ranked = [...allData].sort((a, b) => b.volume24h - a.volume24h);
    return new Set(
      ranked
        .slice(0, HIGH_VOLUME_VISIBLE_COUNT)
        .filter(token => token.volume24h > 0)
        .map(token => token.contractAddress.toLowerCase()),
    );
  }, [allData]);

  const tokenMetaByAddress = useMemo(() => {
    const map = new Map<string, TokenActionMeta>();
    const marketStateKnown = marketFeed !== undefined;

    for (const token of allData) {
      const address = token.contractAddress.toLowerCase();
      const market = marketByAddress.get(address);
      const hasMarket = marketStateKnown && !!market;
      const isNeedsSettlement = market?.status === "locked";
      const isHighVolume = highVolumeAddresses.has(address);
      const isSeasonActive = hasMarket && !isNeedsSettlement;
      const labels: TokenActionLabel[] = [];

      if (isNeedsSettlement) {
        labels.push({ id: "needs-settlement", text: "Needs settlement", tone: "amber", pulse: true });
      }

      if (isSeasonActive) {
        labels.push({ id: "season-active", text: "Season active", tone: "violet", pulse: market?.status === "open" });
      }

      if (marketStateKnown && !hasMarket) {
        labels.push({ id: "create-market", text: "Create market", tone: "slate" });
      }

      if (isHighVolume) {
        labels.push({ id: "high-volume", text: "High volume", tone: "pink" });
      }

      map.set(address, {
        marketStateKnown,
        hasMarket,
        isNeedsSettlement,
        isHighVolume,
        isSeasonActive,
        labels,
      });
    }

    return map;
  }, [allData, highVolumeAddresses, marketByAddress, marketFeed]);

  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<TokenFilter>("all");

  const handleToggle = useCallback((addr: string) => {
    setExpandedToken(prev => (prev === addr ? null : addr));
  }, []);

  const getTokenMeta = useCallback(
    (address: string) => tokenMetaByAddress.get(address.toLowerCase()) ?? EMPTY_META,
    [tokenMetaByAddress],
  );

  const matchesFilter = useCallback(
    (token: (typeof allData)[number], filter: TokenFilter) => {
      if (filter === "all") return true;

      const meta = getTokenMeta(token.contractAddress);
      if (!meta.marketStateKnown && filter !== "highVolume") return false;
      if (filter === "needsSettlement") return meta.isNeedsSettlement;
      if (filter === "create") return !meta.hasMarket;
      if (filter === "highVolume") return meta.isHighVolume;
      return meta.isSeasonActive;
    },
    [getTokenMeta],
  );

  const filteredTokens = useMemo(() => {
    const sourceTokens = search.trim() || activeFilter !== "all" ? allData : tokens;
    if (!sourceTokens || sourceTokens.length === 0) return [];

    let result = sourceTokens;
    if (activeFilter !== "all") {
      result = result.filter(t => matchesFilter(t, activeFilter));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        t =>
          t.symbol.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.contractAddress.toLowerCase().includes(q),
      );
    }
    return result;
  }, [tokens, allData, search, activeFilter, matchesFilter]);

  const filterStats = useMemo(
    () =>
      (Object.keys(FILTER_LABELS) as TokenFilter[])
        .map(filter => ({
          key: filter,
          label: FILTER_LABELS[filter],
          count: filter === "all" ? allData.length : allData.filter(token => matchesFilter(token, filter)).length,
        }))
        .filter(filter => filter.key === "all" || filter.count > 0),
    [allData, matchesFilter],
  );

  const tokenCount = totalCount > 0 ? totalCount : tokens.length;
  const tokenCountHint = "Only tokens with an available price and non-zero 24h volume are displayed.";

  // Show loading skeleton while data is loading OR when we have no data yet (API cold start).
  // The 10s refetch interval will keep retrying until tokens arrive — never show a dead-end empty state.
  const showSkeleton = isLoading || !tokens || tokens.length === 0;

  if (showSkeleton) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-lg font-extrabold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
            Agentic Tokens
          </h2>
          {isFetching && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-pg-violet animate-pulse" />
              <span className="text-[10px] text-pg-muted font-medium">Loading tokens…</span>
            </div>
          )}
        </div>

        <div className={COL_HEADER} style={{ fontFamily: "var(--font-heading)" }}>
          <span className="w-10 flex-shrink-0" />
          <span className="flex-1 min-w-0">Token</span>
          <span className="w-28 text-left flex-shrink-0">Price</span>
          <span className="w-24 text-left pl-1 flex-shrink-0">24h</span>
          <span className="w-24 text-left pl-2 flex-shrink-0 hidden sm:block">Mkt Cap</span>
          <span className="w-24 text-right pr-3 flex-shrink-0 hidden md:block">Volume</span>
          <span className="w-4 flex-shrink-0" />
        </div>

        <div className="space-y-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="token-row animate-pulse">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-10 h-10 rounded-xl bg-pg-border/40 flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="h-3.5 w-16 bg-pg-border/40 rounded-lg" />
                  <div className="h-2.5 w-24 bg-pg-border/30 rounded-lg" />
                </div>
                <div className="w-28 flex justify-start flex-shrink-0">
                  <div className="h-3.5 w-16 bg-pg-border/40 rounded-lg" />
                </div>
                <div className="w-24 flex justify-start flex-shrink-0">
                  <div className="h-3 w-14 bg-pg-border/30 rounded-full" />
                </div>
                <div className="w-24 pl-2 flex justify-start flex-shrink-0 hidden sm:flex">
                  <div className="h-3.5 w-14 bg-pg-border/40 rounded-lg" />
                </div>
                <div className="w-24 pr-3 flex justify-end flex-shrink-0 hidden md:flex">
                  <div className="h-3.5 w-14 bg-pg-border/40 rounded-lg" />
                </div>
                <div className="w-4 flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Section header + search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="relative inline-flex items-start">
          <h2 className="text-lg font-extrabold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
            Agentic Tokens
          </h2>
          <span className="absolute -top-1 -right-7 inline-flex items-center gap-0.5">
            <span className="text-[10px] font-bold text-pg-muted/50 tabular-nums leading-none">
              {tokenCount.toLocaleString()}
            </span>
            <InfoTooltip text={tokenCountHint} iconClassName="h-2.5 w-2.5 text-pg-muted/40" />
          </span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pg-muted/60"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tokens..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-base-200/50 border-2 border-pg-border rounded-xl text-base-content placeholder:text-pg-muted/50 focus:outline-none focus:border-pg-violet/50 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-pg-border/60 flex items-center justify-center text-pg-muted hover:bg-pg-border transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Season 1 action filters */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filterStats.map(filter => {
          const isActive = activeFilter === filter.key;
          return (
            <button
              key={filter.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActiveFilter(filter.key)}
              className={`inline-flex min-h-9 flex-shrink-0 items-center gap-2 rounded-xl border-2 px-3 py-1.5 text-[11px] font-extrabold transition-colors ${
                isActive
                  ? "border-pg-violet/45 bg-pg-violet/12 text-pg-violet shadow-pop-soft"
                  : "border-pg-border bg-base-100/75 text-pg-muted hover:border-pg-violet/30 hover:text-pg-violet"
              }`}
              style={{ fontFamily: "var(--font-heading)" }}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-pg-violet" : "bg-pg-muted/40"}`} />
              {filter.label}
              <span className="rounded-full bg-base-200/80 px-1.5 py-0.5 text-[10px] tabular-nums text-pg-muted">
                {filter.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Column labels — aligned to TokenCard inner layout */}
      <div className={COL_HEADER} style={{ fontFamily: "var(--font-heading)" }}>
        <span className="w-10 flex-shrink-0" />
        <span className="flex-1 min-w-0">Token</span>
        <span className="w-28 text-left flex-shrink-0">Price</span>
        <span className="w-24 text-left pl-1 flex-shrink-0">24h</span>
        <span className="w-24 text-left pl-2 flex-shrink-0 hidden sm:block">Mkt Cap</span>
        <span className="w-24 text-right pr-3 flex-shrink-0 hidden md:block">Volume</span>
        <span className="w-4 flex-shrink-0" />
      </div>

      {/* Token list */}
      {filteredTokens.length > 0 ? (
        <div className="space-y-1.5">
          {filteredTokens.map((token, i) => {
            const meta = getTokenMeta(token.contractAddress);
            return (
              <div key={token.contractAddress} className={`animate-pop-in stagger-${Math.min(i + 1, 6)}`}>
                <TokenCard
                  token={token}
                  isExpanded={expandedToken === token.contractAddress}
                  onToggle={() => handleToggle(token.contractAddress)}
                  hasMarket={meta.marketStateKnown ? meta.hasMarket : undefined}
                  actionLabels={meta.labels}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-sm text-pg-muted font-medium">
            {search
              ? `No tokens matching "${search}"`
              : `No tokens in ${FILTER_LABELS[activeFilter].toLowerCase()} right now`}
          </p>
        </div>
      )}

      {/* Load More */}
      {hasNextPage && !search && activeFilter === "all" && (
        <div className="flex justify-center mt-8">
          <button onClick={fetchNextPage} className="btn-outline-geo px-8 py-2.5 text-sm font-bold">
            Load More Tokens
          </button>
        </div>
      )}
    </div>
  );
}
