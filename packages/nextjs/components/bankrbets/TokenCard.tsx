"use client";

import { memo, useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAccount } from "wagmi";
import { TokenCountdown } from "~~/components/bankrbets/TokenCountdown";
import { BankrToken } from "~~/hooks/bankrbets/useBankrTokens";

const CHUNK_RELOAD_GUARD_KEY = "__bankrbets_chunk_retry__";

function withChunkRetry<T>(loader: () => Promise<T>) {
  return async () => {
    try {
      const loaded = await loader();
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
      }
      return loaded;
    } catch (error) {
      if (typeof window !== "undefined") {
        const hasRetried = window.sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === "1";
        if (!hasRetried) {
          window.sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, "1");
          window.location.reload();
          return new Promise<never>(() => {});
        }
        window.sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
      }
      throw error;
    }
  };
}

const PriceChart = dynamic(
  withChunkRetry(() => import("./PriceChart").then(m => m.PriceChart)),
  {
    ssr: false,
    loading: () => (
      <div className="h-[200px] flex items-center justify-center">
        <span className="loading loading-spinner loading-sm text-pg-violet" />
      </div>
    ),
  },
);

const CreateMarketModal = dynamic(
  withChunkRetry(() => import("./CreateMarketModal").then(m => m.CreateMarketModal)),
  {
    ssr: false,
    loading: () => null,
  },
);

interface TokenCardProps {
  token: BankrToken;
  isExpanded: boolean;
  onToggle: () => void;
  hasMarket?: boolean;
}

/** Rotating accent colors for token avatars without images */
const AVATAR_COLORS = [
  { bg: "bg-pg-violet/15", text: "text-pg-violet", border: "border-pg-violet/30" },
  { bg: "bg-pg-pink/15", text: "text-pg-pink", border: "border-pg-pink/30" },
  { bg: "bg-pg-amber/15", text: "text-pg-amber", border: "border-pg-amber/30" },
  { bg: "bg-pg-mint/15", text: "text-pg-mint", border: "border-pg-mint/30" },
];

function getAvatarColor(symbol: string) {
  const hash = symbol.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export const TokenCard = memo(function TokenCard({ token, isExpanded, onToggle, hasMarket }: TokenCardProps) {
  const { isConnected } = useAccount();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const isPositive = token.change24h >= 0;
  const changeColor = isPositive ? "text-pg-mint" : "text-pg-pink";
  const changeBg = isPositive ? "bg-pg-mint/10" : "bg-pg-pink/10";
  const chartPoolAddress = token.poolId || token.topPoolAddress;
  const marketLink = `/market#${token.contractAddress},${chartPoolAddress}`;
  const avatarColor = useMemo(() => getAvatarColor(token.symbol), [token.symbol]);

  const openModal = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowCreateModal(true);
  }, []);

  const closeModal = useCallback(() => setShowCreateModal(false), []);

  const stats = useMemo(
    () => [
      { label: "Price", value: token.priceFormatted, mono: true },
      { label: "Mkt Cap", value: token.marketCapFormatted },
      { label: "24h Vol", value: token.volumeFormatted },
      {
        label: "24h Change",
        value: `${isPositive ? "+" : ""}${token.change24h.toFixed(2)}%`,
        color: changeColor,
      },
    ],
    [token.priceFormatted, token.marketCapFormatted, token.volumeFormatted, token.change24h, isPositive, changeColor],
  );

  return (
    <>
      <div className={`token-row ${isExpanded ? "expanded" : ""}`}>
        {/* ── Main clickable row ──────────────────────────────── */}
        <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer">
          {/* Token image */}
          {token.imgUrl ? (
            <img
              src={token.imgUrl}
              alt={token.symbol}
              loading="lazy"
              className="w-10 h-10 rounded-xl flex-shrink-0 object-cover border-2 border-pg-border bg-base-200"
              onError={e => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
              }}
            />
          ) : null}
          <div
            className={`w-10 h-10 rounded-xl ${avatarColor.bg} ${avatarColor.border} border-2 flex items-center justify-center ${avatarColor.text} font-extrabold text-xs flex-shrink-0 ${token.imgUrl ? "hidden" : ""}`}
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {token.symbol.slice(0, 2).toUpperCase()}
          </div>

          {/* Name + Symbol */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                className="font-bold text-sm truncate text-base-content"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {token.symbol}
              </span>
              {hasMarket ? (
                <>
                  <span
                    className="inline-flex items-center gap-1 text-[9px] font-extrabold px-2 py-0.5 rounded-full"
                    style={{
                      background: "linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(168,35,196,0.12) 100%)",
                      border: "1px solid rgba(139,92,246,0.3)",
                      color: "#7c3aed",
                      boxShadow: "0 0 6px rgba(139,92,246,0.15)",
                    }}
                  >
                    <span className="text-[9px] leading-none">$</span>
                    BET
                  </span>
                  <TokenCountdown tokenAddress={token.contractAddress} />
                </>
              ) : null}
            </div>
            <p className="text-[11px] text-pg-muted truncate">{token.name}</p>
          </div>

          {/* Price */}
          <div className="text-left flex-shrink-0 w-20 sm:w-28">
            <p className="font-mono text-xs sm:text-sm font-bold tracking-tight text-base-content">
              {token.priceFormatted}
            </p>
          </div>

          {/* 24h Change */}
          <div className="text-left flex-shrink-0 w-16 sm:w-24">
            <span
              className={`inline-flex items-center text-xs font-bold ${changeColor} ${changeBg} px-2 py-0.5 rounded-full`}
            >
              {isPositive ? "+" : ""}
              {token.change24h.toFixed(1)}%
            </span>
          </div>

          {/* Market Cap */}
          <div className="text-left pl-1 sm:pl-2 flex-shrink-0 w-20 sm:w-24 hidden sm:block">
            <p className="text-xs text-pg-muted font-medium">{token.marketCapFormatted}</p>
          </div>

          {/* Volume */}
          <div className="text-right pr-2 sm:pr-3 flex-shrink-0 w-20 sm:w-24 hidden md:block">
            <p className="text-xs text-pg-muted font-medium">{token.volumeFormatted}</p>
          </div>

          {/* Arrow */}
          <svg
            className={`w-4 h-4 text-pg-muted/40 group-hover:text-pg-violet transition-all duration-300 flex-shrink-0 ${
              isExpanded ? "rotate-90 text-pg-violet" : ""
            }`}
            style={{ transitionTimingFunction: "var(--ease-bounce)" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>

        {/* ── Expanded section ────────────────────────────────── */}
        {isExpanded && (
          <div className="card-expand-enter overflow-hidden">
            <div className="border-t-2 border-pg-border/60 px-4 pb-5">
              {/* Chart (lazy loaded) */}
              {chartPoolAddress && (
                <div className="mt-4 rounded-xl overflow-hidden border-2 border-pg-border bg-base-200/30">
                  <PriceChart
                    poolAddress={chartPoolAddress}
                    tokenAddress={token.contractAddress}
                    height={200}
                    compact
                  />
                </div>
              )}

              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                {stats.map(stat => (
                  <div key={stat.label} className="bg-base-200/50 rounded-lg px-3 py-2.5 border border-pg-border/50">
                    <p
                      className="text-[10px] text-pg-muted uppercase tracking-wider font-bold"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      {stat.label}
                    </p>
                    <p
                      className={`text-sm font-bold mt-0.5 ${stat.color || "text-base-content"} ${stat.mono ? "font-mono" : ""}`}
                    >
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 mt-4">
                {isConnected && !hasMarket && (
                  <button onClick={openModal} className="btn-candy flex-1 text-sm text-center">
                    Create
                  </button>
                )}
                <Link href={marketLink} className="btn-outline-geo flex-1 text-sm text-center">
                  {hasMarket ? "View Market" : "View Details"}
                </Link>
              </div>

              {/* Token address */}
              <div className="flex items-center justify-between mt-3">
                <p className="text-[10px] text-pg-muted/60 font-mono">
                  {token.contractAddress.slice(0, 6)}...{token.contractAddress.slice(-4)}
                </p>
                {token.deployedAt && (
                  <p className="text-[10px] text-pg-muted/60">{new Date(token.deployedAt).toLocaleDateString()}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Market Modal (lazy loaded) */}
      {showCreateModal && chartPoolAddress && (
        <CreateMarketModal
          tokenAddress={token.contractAddress}
          poolAddress={chartPoolAddress}
          tokenSymbol={token.symbol}
          onClose={closeModal}
        />
      )}
    </>
  );
});
