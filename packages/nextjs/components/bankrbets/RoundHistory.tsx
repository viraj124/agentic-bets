"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { type RoundHistoryEntry, useRoundHistory } from "~~/hooks/bankrbets/useRoundHistory";

interface RoundHistoryProps {
  tokenAddress: string;
  currentEpoch?: bigint;
}

function formatPrice(raw: bigint): string {
  const num = Number(raw) / 1e18;
  if (num === 0) return "$0";
  if (num < 0.0001) return `$${num.toExponential(2)}`;
  if (num < 1) return `$${num.toPrecision(4)}`;
  if (num < 1000) return `$${num.toFixed(4)}`;
  return `$${num.toFixed(2)}`;
}

function formatUSDC(raw: bigint): string {
  const num = Number(raw) / 1e6;
  return `$${num.toFixed(2)}`;
}

function timeAgo(timestamp: bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - Number(timestamp);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function RoundRow({ entry }: { entry: RoundHistoryEntry }) {
  const { round, userBet, epoch } = entry;

  if (!round) {
    return (
      <div className="px-4 py-3 rounded-xl bg-base-200/30 border border-pg-border/50">
        <span className="text-xs text-pg-muted">Round #{epoch.toString()} — unavailable</span>
      </div>
    );
  }

  const isSettled = round.oracleCalled;
  const isCancelled = round.cancelled;
  const isLive = !isSettled && !isCancelled;
  const upWon = isSettled && !isCancelled && round.closePrice > round.lockPrice;
  const downWon = isSettled && !isCancelled && round.closePrice < round.lockPrice;
  const isTie = isSettled && !isCancelled && round.closePrice === round.lockPrice;

  // Price change
  const lockPriceNum = Number(round.lockPrice) / 1e18;
  const closePriceNum = Number(round.closePrice) / 1e18;
  const pctChange = lockPriceNum > 0 && isSettled ? ((closePriceNum - lockPriceNum) / lockPriceNum) * 100 : null;

  // User bet outcome
  let userOutcome: "won" | "lost" | "refund" | "pending" | null = null;
  let userWinnings = 0n;
  if (userBet) {
    if (!isSettled) {
      userOutcome = "pending";
    } else if (isCancelled || isTie) {
      userOutcome = "refund";
      userWinnings = userBet.amount;
    } else {
      const userBetUp = userBet.position === 0;
      const won = (userBetUp && upWon) || (!userBetUp && downWon);
      userOutcome = won ? "won" : "lost";
      if (won && round.rewardBaseCalAmount > 0n) {
        userWinnings = (userBet.amount * round.rewardAmount) / round.rewardBaseCalAmount;
      }
    }
  }

  // Row tint
  let rowBg = "bg-base-200/20 border-pg-border/50";
  if (isLive) rowBg = "bg-pg-violet/5 border-pg-violet/20";
  else if (isCancelled || isTie) rowBg = "bg-pg-amber/5 border-pg-amber/20";
  else if (upWon) rowBg = "bg-pg-mint/5 border-pg-mint/20";
  else if (downWon) rowBg = "bg-pg-pink/5 border-pg-pink/20";

  return (
    <div className={`px-4 py-3 rounded-xl border ${rowBg} transition-colors`}>
      {/* Top row: epoch, badge, prices */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-extrabold text-base-content font-mono shrink-0">#{epoch.toString()}</span>
          {isLive ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-pg-violet/15 text-pg-violet rounded-full px-2 py-0.5 border border-pg-violet/30">
              <span className="w-1.5 h-1.5 rounded-full bg-pg-violet animate-pulse" />
              Live
            </span>
          ) : isCancelled || isTie ? (
            <span className="text-[10px] font-bold bg-pg-amber/15 text-pg-amber rounded-full px-2 py-0.5 border border-pg-amber/30">
              Cancelled
            </span>
          ) : upWon ? (
            <span className="text-[10px] font-bold bg-pg-mint/15 text-pg-mint rounded-full px-2 py-0.5 border border-pg-mint/30">
              UP Won
            </span>
          ) : downWon ? (
            <span className="text-[10px] font-bold bg-pg-pink/15 text-pg-pink rounded-full px-2 py-0.5 border border-pg-pink/30">
              DOWN Won
            </span>
          ) : null}
        </div>
        <span className="text-[10px] text-pg-muted/60 shrink-0">
          {round.startTimestamp > 0n ? timeAgo(round.startTimestamp) : ""}
        </span>
      </div>

      {/* Price & pool row */}
      <div className="flex items-center justify-between gap-2 mt-1.5">
        <div className="text-[11px] font-mono text-pg-muted min-w-0 truncate">
          {round.lockPrice > 0n ? (
            <>
              {formatPrice(round.lockPrice)}
              {isSettled && (
                <>
                  <span className="mx-1 text-pg-muted/40">&rarr;</span>
                  {formatPrice(round.closePrice)}
                  {pctChange !== null && (
                    <span className={`ml-1 font-bold ${pctChange >= 0 ? "text-pg-mint" : "text-pg-pink"}`}>
                      {pctChange >= 0 ? "+" : ""}
                      {pctChange.toFixed(2)}%
                    </span>
                  )}
                </>
              )}
            </>
          ) : (
            <span className="text-pg-muted/40">Awaiting lock price</span>
          )}
        </div>
        <span className="text-[11px] font-bold text-base-content font-mono">{formatUSDC(round.totalAmount)}</span>
      </div>

      {/* User bet row */}
      {userBet && (
        <div className="mt-2 pt-2 border-t border-pg-border/30">
          <div className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="text-pg-muted">Your bet:</span>
              <span className="font-bold font-mono text-base-content">{formatUSDC(userBet.amount)}</span>
              <span className={`font-bold ${userBet.position === 0 ? "text-pg-mint" : "text-pg-pink"}`}>
                {userBet.position === 0 ? "UP" : "DOWN"}
              </span>
            </div>
            {userOutcome === "won" ? (
              <span className="font-bold text-pg-mint">Won {userWinnings > 0n ? formatUSDC(userWinnings) : ""}</span>
            ) : userOutcome === "lost" ? (
              <span className="font-bold text-pg-pink">Lost</span>
            ) : userOutcome === "refund" ? (
              <span className="font-bold text-pg-amber">{userBet.claimed ? "Refunded" : "Refund available"}</span>
            ) : (
              <span className="font-bold text-pg-violet">In progress</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function RoundHistory({ tokenAddress, currentEpoch }: RoundHistoryProps) {
  const [page, setPage] = useState(0);
  const { address } = useAccount();
  const { entries, totalPages, totalRounds, isLoading } = useRoundHistory(tokenAddress, currentEpoch, page, address);

  if (!currentEpoch || currentEpoch === 0n) {
    return null;
  }

  return (
    <div className="bg-base-100 rounded-2xl border-2 border-pg-border overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b-2 border-pg-border flex items-center justify-between">
        <span className="text-sm font-extrabold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
          Round history
        </span>
        <span className="text-[11px] text-pg-muted font-mono">
          {totalRounds} round{totalRounds !== 1 ? "s" : ""}
        </span>
      </div>

      {/* List */}
      <div className="p-3 space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-4 py-4 rounded-xl bg-base-200/30 border border-pg-border/50 animate-pulse">
              <div className="h-3 w-24 bg-base-300 rounded mb-2" />
              <div className="h-2.5 w-40 bg-base-300 rounded" />
            </div>
          ))
        ) : entries.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-pg-muted">No rounds yet</p>
          </div>
        ) : (
          entries.map(entry => <RoundRow key={entry.epoch.toString()} entry={entry} />)
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t-2 border-pg-border flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1 text-xs font-bold rounded-lg border border-pg-border text-pg-muted hover:border-pg-violet/40 hover:text-pg-violet disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Newer
          </button>
          <span className="text-[10px] text-pg-muted/60 font-mono">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1 text-xs font-bold rounded-lg border border-pg-border text-pg-muted hover:border-pg-violet/40 hover:text-pg-violet disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Older
          </button>
        </div>
      )}
    </div>
  );
}
