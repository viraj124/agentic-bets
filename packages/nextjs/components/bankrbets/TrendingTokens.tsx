"use client";

import { useCallback, useState } from "react";
import { TokenCard } from "./TokenCard";
import { useBankrTokens } from "~~/hooks/bankrbets/useBankrTokens";

export function TrendingTokens() {
  const { data: tokens, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useBankrTokens();
  const [expandedToken, setExpandedToken] = useState<string | null>(null);

  const handleToggle = useCallback((addr: string) => {
    setExpandedToken(prev => (prev === addr ? null : addr));
  }, []);

  if (isLoading) {
    return (
      <div>
        {/* Section header */}
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-extrabold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
            Bankr Tokens
          </h2>
          <div className="h-1 w-8 rounded-full bg-pg-pink" />
        </div>

        {/* Column labels */}
        <div
          className="flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-pg-muted font-bold border-b-2 border-pg-border mb-2"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          <span className="w-10" />
          <span className="flex-1">Token</span>
          <span className="w-24 text-right">Price</span>
          <span className="w-20 text-right">24h</span>
          <span className="w-20 text-right hidden sm:block">Mkt Cap</span>
          <span className="w-20 text-right hidden md:block">Volume</span>
          <span className="w-4" />
        </div>

        {/* Skeleton rows */}
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="token-row animate-pulse">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-10 h-10 rounded-xl bg-pg-border/40" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-16 bg-pg-border/40 rounded-lg" />
                  <div className="h-2.5 w-24 bg-pg-border/30 rounded-lg" />
                </div>
                <div className="h-3.5 w-16 bg-pg-border/40 rounded-lg" />
                <div className="h-3 w-14 bg-pg-border/30 rounded-full" />
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
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-extrabold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
            Bankr Tokens
          </h2>
          <div className="h-1 w-8 rounded-full bg-pg-pink" />
          <span className="text-xs font-bold text-pg-muted bg-pg-border/50 px-2.5 py-0.5 rounded-full">
            {tokens.length}
          </span>
        </div>
      </div>

      {/* Column labels */}
      <div
        className="flex items-center gap-3 px-4 py-2 text-[10px] uppercase tracking-wider text-pg-muted font-bold border-b-2 border-pg-border mb-2"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        <span className="w-10" />
        <span className="flex-1">Token</span>
        <span className="w-24 text-right">Price</span>
        <span className="w-20 text-right">24h</span>
        <span className="w-20 text-right hidden sm:block">Mkt Cap</span>
        <span className="w-20 text-right hidden md:block">Volume</span>
        <span className="w-4" />
      </div>

      {/* Token list */}
      <div className="space-y-2">
        {tokens.map((token, i) => (
          <div key={token.contractAddress} className={`animate-pop-in stagger-${Math.min(i + 1, 6)}`}>
            <TokenCard
              token={token}
              isExpanded={expandedToken === token.contractAddress}
              onToggle={() => handleToggle(token.contractAddress)}
            />
          </div>
        ))}
      </div>

      {/* Load More */}
      {hasNextPage && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="btn-outline-geo text-sm disabled:opacity-50"
          >
            {isFetchingNextPage ? (
              <span className="flex items-center gap-2">
                <span className="loading loading-spinner loading-xs" />
                Loading...
              </span>
            ) : (
              "Load more tokens"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
