"use client";

import { useCallback, useMemo, useState } from "react";
import { TokenCard } from "./TokenCard";
import { useBankrTokens } from "~~/hooks/bankrbets/useBankrTokens";
import { useMarketTokens } from "~~/hooks/bankrbets/useMarketTokens";

/** Shared column widths so header labels align with TokenCard data */
const COL_HEADER =
  "hidden sm:flex items-center gap-3 px-4 py-2.5 text-[10px] uppercase tracking-wider text-pg-muted font-bold border-b-2 border-pg-border mb-1";

export function TrendingTokens() {
  const { data: tokens, allData, isLoading, hasNextPage, fetchNextPage, totalCount } = useBankrTokens();
  const { tokens: marketTokens } = useMarketTokens();
  const marketAddresses = useMemo(() => {
    const set = new Set<string>();
    marketTokens.forEach(m => set.add(m.token.toLowerCase()));
    return set;
  }, [marketTokens]);
  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showMarketsOnly, setShowMarketsOnly] = useState(false);

  const handleToggle = useCallback((addr: string) => {
    setExpandedToken(prev => (prev === addr ? null : addr));
  }, []);

  const filteredTokens = useMemo(() => {
    const sourceTokens = search.trim() || showMarketsOnly ? allData : tokens;
    if (!sourceTokens || sourceTokens.length === 0) return [];

    let result = sourceTokens;
    if (showMarketsOnly) {
      result = result.filter(t => marketAddresses.has(t.contractAddress.toLowerCase()));
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
  }, [tokens, allData, search, showMarketsOnly, marketAddresses]);

  const tokenCount = totalCount > 0 ? totalCount : tokens.length;
  const tokenCountHint = "Only tokens with an available price are displayed.";

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-5">
          <h2 className="text-lg font-extrabold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
            Bankr Tokens
          </h2>
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

  if (!tokens || tokens.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="card-sticker inline-flex flex-col items-center px-10 py-8">
          <div className="w-16 h-16 rounded-2xl bg-pg-violet/10 border-2 border-pg-violet/20 flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-pg-violet/40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5"
              />
            </svg>
          </div>
          <p className="text-base font-bold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
            No tokens found
          </p>
          <p className="text-sm text-pg-muted mt-1">Check back soon for Bankr ecosystem tokens</p>
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
            Bankr Tokens
          </h2>
          <span
            className="tooltip tooltip-bottom tooltip-primary absolute -top-1 -right-7"
            data-tip={tokenCountHint}
            title={tokenCountHint}
            aria-label={tokenCountHint}
          >
            <span className="text-[10px] font-bold text-pg-muted/50 tabular-nums leading-none">
              {tokenCount.toLocaleString()}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Markets filter toggle */}
          <button
            onClick={() => setShowMarketsOnly(prev => !prev)}
            className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl border-2 transition-colors flex-shrink-0 ${
              showMarketsOnly
                ? "bg-pg-violet/15 border-pg-violet/40 text-pg-violet"
                : "bg-base-200/50 border-pg-border text-pg-muted hover:border-pg-violet/30 hover:text-pg-violet"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${showMarketsOnly ? "bg-pg-violet animate-pulse" : "bg-pg-muted/40"}`}
            />
            Trade
          </button>

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
          {filteredTokens.map((token, i) => (
            <div key={token.contractAddress} className={`animate-pop-in stagger-${Math.min(i + 1, 6)}`}>
              <TokenCard
                token={token}
                isExpanded={expandedToken === token.contractAddress}
                onToggle={() => handleToggle(token.contractAddress)}
                hasMarket={marketAddresses.has(token.contractAddress.toLowerCase())}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-sm text-pg-muted font-medium">No tokens matching &ldquo;{search}&rdquo;</p>
        </div>
      )}

      {/* Load More */}
      {hasNextPage && !search && (
        <div className="flex justify-center mt-8">
          <button onClick={fetchNextPage} className="btn-outline-geo px-8 py-2.5 text-sm font-bold">
            Load More Tokens
          </button>
        </div>
      )}
    </div>
  );
}
