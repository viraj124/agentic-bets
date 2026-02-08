"use client";

import { useState } from "react";
import { TokenCard } from "./TokenCard";
import { useClankerTokens } from "~~/hooks/bankrbets/useClankerTokens";
import { useEligibleTokens } from "~~/hooks/bankrbets/useEligibleTokens";
import { PoolData, useGeckoTerminalMulti } from "~~/hooks/bankrbets/useGeckoTerminal";

type Filter = "all" | "live" | "new";

export function TrendingTokens() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data: tokens, isLoading: tokensLoading } = useClankerTokens(20);
  const { eligibleSet } = useEligibleTokens();

  const poolAddresses = (tokens || []).map(t => t.poolAddress).filter(Boolean);
  const { data: poolsData } = useGeckoTerminalMulti(poolAddresses);

  if (tokensLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="animate-pulse bg-base-100 border border-base-300/60 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-base-300/50" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-16 bg-base-300/50 rounded" />
                <div className="h-3 w-24 bg-base-300/50 rounded" />
              </div>
            </div>
            <div className="flex justify-between">
              <div className="h-6 w-24 bg-base-300/50 rounded" />
              <div className="h-4 w-16 bg-base-300/50 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!tokens || tokens.length === 0) {
    return (
      <div className="text-center py-16 text-base-content/40">
        <p className="text-base font-medium">No tokens found</p>
        <p className="text-sm mt-1">Check back soon for new Clanker token markets</p>
      </div>
    );
  }

  const poolMap = new Map<string, PoolData>();
  if (poolsData) {
    poolsData.forEach(p => poolMap.set(p.poolAddress.toLowerCase(), p));
  }

  // Filter tokens
  let filteredTokens = tokens;
  if (filter === "live") {
    filteredTokens = tokens.filter(t => eligibleSet.has(t.contractAddress.toLowerCase()));
  } else if (filter === "new") {
    filteredTokens = tokens.filter(t => !eligibleSet.has(t.contractAddress.toLowerCase()));
  }

  // Sort: live markets first when showing all
  if (filter === "all") {
    filteredTokens = [...filteredTokens].sort((a, b) => {
      const aLive = eligibleSet.has(a.contractAddress.toLowerCase()) ? 0 : 1;
      const bLive = eligibleSet.has(b.contractAddress.toLowerCase()) ? 0 : 1;
      return aLive - bLive;
    });
  }

  const liveCount = tokens.filter(t => eligibleSet.has(t.contractAddress.toLowerCase())).length;

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-4">
        {[
          { key: "all" as Filter, label: "All" },
          { key: "live" as Filter, label: `Live (${liveCount})` },
          { key: "new" as Filter, label: "No Market" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              filter === tab.key
                ? "bg-primary/10 text-primary"
                : "text-base-content/40 hover:text-base-content/60 hover:bg-base-200/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filteredTokens.map(token => (
          <TokenCard
            key={token.id}
            token={token}
            poolData={poolMap.get(token.poolAddress.toLowerCase())}
            isEligible={eligibleSet.has(token.contractAddress.toLowerCase())}
          />
        ))}
      </div>

      {filteredTokens.length === 0 && (
        <div className="text-center py-12 text-base-content/40">
          <p className="text-sm">No tokens match this filter</p>
        </div>
      )}
    </div>
  );
}
