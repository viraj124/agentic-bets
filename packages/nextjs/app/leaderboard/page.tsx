"use client";

import { useMemo } from "react";
import type { NextPage } from "next";
import { IdentityBadge } from "~~/components/bankrbets/IdentityBadge";
import { useLeaderboard } from "~~/hooks/bankrbets/useLeaderboard";
import { useResolvedAddresses } from "~~/hooks/bankrbets/useResolvedAddresses";

const MEDALS = ["", "", ""];

const LeaderboardPage: NextPage = () => {
  const { leaderboard, isLoading } = useLeaderboard();
  const addresses = useMemo(() => leaderboard.map(entry => entry.address), [leaderboard]);
  const { data: resolvedMap } = useResolvedAddresses(addresses);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-11 h-11 rounded-2xl bg-pg-amber border-2 border-pg-slate flex items-center justify-center shadow-pop flex-shrink-0">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.04 6.04 0 0 1-2.27.79 6.04 6.04 0 0 1-2.27-.79"
            />
          </svg>
        </div>
        <div>
          <h1
            className="text-2xl font-extrabold tracking-tight text-base-content"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Leaderboard
          </h1>
          <p className="text-sm text-pg-muted">Top predictors ranked by net profit</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-base-100 rounded-2xl border-2 border-pg-border overflow-hidden">
        {/* Table header */}
        <div
          className="flex items-center px-5 py-3 border-b-2 border-pg-border text-[10px] uppercase tracking-wider text-pg-muted font-bold"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          <span className="w-14 flex-shrink-0">Rank</span>
          <span className="flex-1 min-w-0">Address</span>
          <span className="w-20 text-right flex-shrink-0">Win rate</span>
          <span className="w-16 text-right flex-shrink-0">Bets</span>
          <span className="w-24 text-right flex-shrink-0">Net P&L</span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center">
            <span className="loading loading-spinner loading-md text-pg-violet" />
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-pg-amber/10 border-2 border-pg-amber/20 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-7 h-7 text-pg-amber/40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.04 6.04 0 0 1-2.27.79 6.04 6.04 0 0 1-2.27-.79"
                />
              </svg>
            </div>
            <p className="text-base font-bold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
              No data yet
            </p>
            <p className="text-sm text-pg-muted mt-1">Place bets to appear on the leaderboard</p>
          </div>
        ) : (
          <div>
            {leaderboard.map((entry, i) => (
              <div
                key={entry.address}
                className="flex items-center px-5 py-3.5 border-b-2 border-pg-border/40 last:border-b-0 text-sm hover:bg-pg-cream/50 transition-colors"
              >
                {/* Rank */}
                <div className="w-14 flex-shrink-0">
                  {i < 3 ? (
                    <span className="text-lg">{MEDALS[i]}</span>
                  ) : (
                    <span
                      className="text-xs font-bold text-pg-muted bg-pg-border/50 w-7 h-7 inline-flex items-center justify-center rounded-full"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      {i + 1}
                    </span>
                  )}
                </div>

                {/* Address */}
                <div className="flex-1 min-w-0">
                  <IdentityBadge address={entry.address} resolved={resolvedMap.get(entry.address.toLowerCase())} />
                </div>

                {/* Win rate */}
                <div className="w-20 text-right flex-shrink-0">
                  <span className="text-xs font-bold" style={{ fontFamily: "var(--font-heading)" }}>
                    {entry.winRate.toFixed(0)}%
                  </span>
                </div>

                {/* Bets */}
                <div className="w-16 text-right flex-shrink-0">
                  <span className="text-xs text-pg-muted font-medium">{entry.totalBets}</span>
                </div>

                {/* Net P&L */}
                <div className="w-24 text-right flex-shrink-0">
                  <span
                    className={`text-sm font-bold ${entry.netPnL >= 0 ? "text-pg-mint" : "text-pg-pink"}`}
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    {entry.netPnL >= 0 ? "+" : ""}${entry.netPnL.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaderboardPage;
