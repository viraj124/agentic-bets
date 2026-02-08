"use client";

import { useState } from "react";
import Link from "next/link";
import { CreateMarketModal } from "./CreateMarketModal";
import { ClankerToken } from "~~/hooks/bankrbets/useClankerTokens";
import { PoolData } from "~~/hooks/bankrbets/useGeckoTerminal";

interface TokenCardProps {
  token: ClankerToken;
  poolData?: PoolData;
  isEligible?: boolean;
}

export function TokenCard({ token, poolData, isEligible }: TokenCardProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const isPositive = poolData && poolData.change1h >= 0;
  const changeColor = isPositive ? "text-emerald-600" : "text-red-500";
  const changeBg = isPositive ? "bg-emerald-50" : "bg-red-50";
  const changeSign = isPositive ? "+" : "";

  return (
    <>
      <Link
        href={`/market#${token.contractAddress},${token.poolAddress}`}
        className="group block bg-base-100 rounded-xl p-4 border border-base-300/60 hover:border-primary/40 hover:shadow-md transition-all duration-200"
      >
        <div className="flex items-center gap-3 mb-3">
          {token.imgUrl ? (
            <img src={token.imgUrl} alt={token.symbol} className="w-9 h-9 rounded-full ring-1 ring-base-300" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
              {token.symbol.slice(0, 2)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-sm">{token.symbol}</h3>
              {isEligible ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Live
                </span>
              ) : (
                <button
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowCreateModal(true);
                  }}
                  className="text-[10px] font-medium bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full hover:bg-amber-100 transition-colors"
                >
                  + Create Market
                </button>
              )}
            </div>
            <p className="text-xs text-base-content/40 truncate">{token.name}</p>
          </div>
          {poolData && (
            <span className={`text-xs font-medium px-2 py-1 rounded-md ${changeBg} ${changeColor}`}>
              {changeSign}
              {poolData.change1h.toFixed(1)}%
            </span>
          )}
        </div>

        {poolData ? (
          <div className="flex items-end justify-between">
            <span className="text-lg font-mono font-semibold tracking-tight">{poolData.priceFormatted}</span>
            <span className="text-[11px] text-base-content/40">{poolData.marketCapFormatted}</span>
          </div>
        ) : (
          <div className="flex items-end justify-between">
            <div className="animate-pulse h-6 w-24 bg-base-300/50 rounded" />
            <div className="animate-pulse h-4 w-16 bg-base-300/50 rounded" />
          </div>
        )}
      </Link>

      {showCreateModal && (
        <CreateMarketModal
          tokenAddress={token.contractAddress}
          poolAddress={token.poolAddress}
          tokenSymbol={token.symbol}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </>
  );
}
