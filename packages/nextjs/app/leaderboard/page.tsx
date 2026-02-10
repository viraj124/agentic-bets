"use client";

import type { NextPage } from "next";
import { useLeaderboard } from "~~/hooks/bankrbets/useLeaderboard";

const LeaderboardPage: NextPage = () => {
  const { leaderboard, isLoading } = useLeaderboard();

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-1">Leaderboard</h1>
        <p className="text-sm text-base-content/50">Top predictors ranked by net profit</p>
      </div>

      <div className="bg-base-100 rounded-xl border border-base-300/60 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-6 gap-4 px-5 py-3 border-b border-base-300/60 text-xs font-medium text-base-content/40 uppercase tracking-wider">
          <div>Rank</div>
          <div className="col-span-2">Address</div>
          <div className="text-right">Win rate</div>
          <div className="text-right">Bets</div>
          <div className="text-right">Net P&L</div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center">
            <span className="loading loading-spinner loading-md text-base-content/20" />
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-12 h-12 rounded-full bg-base-200 flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-6 h-6 text-base-content/20"
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
            <p className="text-sm font-medium text-base-content/50">No data yet</p>
            <p className="text-xs text-base-content/40 mt-1">Place bets to appear on the leaderboard</p>
          </div>
        ) : (
          <div>
            {leaderboard.map((entry, i) => (
              <div
                key={entry.address}
                className="grid grid-cols-6 gap-4 px-5 py-3 border-b border-base-300/30 last:border-b-0 text-sm hover:bg-base-200/30 transition-colors"
              >
                <div className="font-bold text-base-content/60">
                  {i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`}
                </div>
                <div className="col-span-2 font-mono text-xs truncate">
                  <a
                    href={`https://basescan.org/address/${entry.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                  >
                    {entry.address.slice(0, 6)}...{entry.address.slice(-4)}
                  </a>
                </div>
                <div className="text-right">{entry.winRate.toFixed(0)}%</div>
                <div className="text-right">{entry.totalBets}</div>
                <div className={`text-right font-medium ${entry.netPnL >= 0 ? "text-success" : "text-error"}`}>
                  {entry.netPnL >= 0 ? "+" : ""}${entry.netPnL.toFixed(2)}
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
