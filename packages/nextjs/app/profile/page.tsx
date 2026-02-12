"use client";

import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { IdentityBadge } from "~~/components/bankrbets/IdentityBadge";
import { useLeaderboard } from "~~/hooks/bankrbets/useLeaderboard";
import { useResolvedAddresses } from "~~/hooks/bankrbets/useResolvedAddresses";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const ProfilePage: NextPage = () => {
  const { address } = useAccount();
  const { leaderboard } = useLeaderboard();
  const { data: resolvedMap } = useResolvedAddresses(address ? [address] : []);

  const { data: creatorEarnings } = useScaffoldReadContract({
    contractName: "BankrBetsPrediction",
    functionName: "creatorEarnings",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address },
  });

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center grow py-24">
        <div className="w-14 h-14 rounded-2xl bg-pg-violet/10 border-2 border-pg-violet/20 flex items-center justify-center mb-4">
          <svg
            className="w-7 h-7 text-pg-violet/40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold mb-2 text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
          Portfolio
        </h1>
        <p className="text-sm text-pg-muted">Connect your wallet to view your betting history</p>
      </div>
    );
  }

  const userStats = leaderboard.find(e => e.address.toLowerCase() === address.toLowerCase());
  const earnings = creatorEarnings ? Number(creatorEarnings) / 1e6 : 0;

  const statCards = [
    { label: "Total bets", value: userStats?.totalBets ?? "--", color: "" },
    { label: "Wins", value: userStats?.wins ?? "--", color: "" },
    { label: "Win rate", value: userStats ? `${userStats.winRate.toFixed(0)}%` : "--", color: "" },
    {
      label: "Net P&L",
      value: userStats ? `${userStats.netPnL >= 0 ? "+" : ""}$${userStats.netPnL.toFixed(2)}` : "--",
      color: userStats ? (userStats.netPnL >= 0 ? "text-pg-mint" : "text-pg-pink") : "",
    },
    { label: "Creator earnings", value: earnings > 0 ? `$${earnings.toFixed(2)}` : "--", color: "text-pg-violet" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-11 h-11 rounded-2xl bg-pg-violet border-2 border-pg-slate flex items-center justify-center shadow-pop flex-shrink-0">
          <span className="text-white text-sm font-extrabold" style={{ fontFamily: "var(--font-heading)" }}>
            {address.slice(2, 4).toUpperCase()}
          </span>
        </div>
        <div>
          <h1
            className="text-2xl font-extrabold tracking-tight text-base-content"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Portfolio
          </h1>
          <div className="mt-1">
            <IdentityBadge address={address} resolved={resolvedMap.get(address.toLowerCase())} size="md" showAddress />
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {statCards.map(stat => (
          <div
            key={stat.label}
            className="bg-base-100 rounded-2xl border-2 border-pg-border p-4 hover:border-pg-slate/40 transition-colors"
          >
            <p
              className="text-[10px] text-pg-muted uppercase tracking-wider font-bold mb-1.5"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {stat.label}
            </p>
            <p
              className={`text-xl font-extrabold ${stat.color || "text-base-content"}`}
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Activity */}
      <div className="bg-base-100 rounded-2xl border-2 border-pg-border overflow-hidden">
        <div className="px-5 py-3.5 border-b-2 border-pg-border">
          <h2 className="text-sm font-extrabold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
            Activity
          </h2>
        </div>

        {userStats ? (
          <div className="p-5 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-pg-muted">Total wagered</span>
              <span className="font-bold" style={{ fontFamily: "var(--font-heading)" }}>
                ${userStats.totalWagered.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-pg-muted">Total won</span>
              <span className="font-bold text-pg-mint" style={{ fontFamily: "var(--font-heading)" }}>
                ${userStats.totalWon.toFixed(2)}
              </span>
            </div>
            {earnings > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-pg-muted">Creator fee income</span>
                <span className="font-bold text-pg-violet" style={{ fontFamily: "var(--font-heading)" }}>
                  ${earnings.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="py-16 text-center">
            <p className="text-sm text-pg-muted font-medium">No bets placed yet</p>
            <p className="text-xs text-pg-muted/60 mt-1">Your history will appear here after placing bets</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
