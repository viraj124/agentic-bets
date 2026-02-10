"use client";

import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { useLeaderboard } from "~~/hooks/bankrbets/useLeaderboard";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const ProfilePage: NextPage = () => {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { leaderboard } = useLeaderboard();

  // Get creator earnings for connected user
  const { data: creatorEarnings } = useScaffoldReadContract({
    contractName: "BankrBetsPrediction",
    functionName: "creatorEarnings",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address },
  });

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center grow py-24">
        <div className="w-16 h-16 rounded-full bg-base-200 flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-base-content/30"
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
        <h1 className="text-2xl font-bold mb-2">Portfolio</h1>
        <p className="text-sm text-base-content/50">Connect your wallet to view your betting history</p>
      </div>
    );
  }

  // Find user stats from leaderboard
  const userStats = leaderboard.find(e => e.address.toLowerCase() === address.toLowerCase());
  const earnings = creatorEarnings ? Number(creatorEarnings) / 1e6 : 0;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-primary font-bold text-lg">{address.slice(2, 4).toUpperCase()}</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-0.5">Portfolio</h1>
          <Address address={address} chain={targetNetwork} />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <div className="bg-base-100 rounded-xl border border-base-300/60 p-4">
          <p className="text-[11px] text-base-content/40 uppercase tracking-wider mb-1">Total bets</p>
          <p className="text-xl font-bold">{userStats?.totalBets ?? "--"}</p>
        </div>
        <div className="bg-base-100 rounded-xl border border-base-300/60 p-4">
          <p className="text-[11px] text-base-content/40 uppercase tracking-wider mb-1">Wins</p>
          <p className="text-xl font-bold">{userStats?.wins ?? "--"}</p>
        </div>
        <div className="bg-base-100 rounded-xl border border-base-300/60 p-4">
          <p className="text-[11px] text-base-content/40 uppercase tracking-wider mb-1">Win rate</p>
          <p className="text-xl font-bold">{userStats ? `${userStats.winRate.toFixed(0)}%` : "--"}</p>
        </div>
        <div className="bg-base-100 rounded-xl border border-base-300/60 p-4">
          <p className="text-[11px] text-base-content/40 uppercase tracking-wider mb-1">Net P&L</p>
          <p
            className={`text-xl font-bold ${userStats && userStats.netPnL >= 0 ? "text-success" : userStats ? "text-error" : ""}`}
          >
            {userStats ? `${userStats.netPnL >= 0 ? "+" : ""}$${userStats.netPnL.toFixed(2)}` : "--"}
          </p>
        </div>
        <div className="bg-base-100 rounded-xl border border-base-300/60 p-4">
          <p className="text-[11px] text-base-content/40 uppercase tracking-wider mb-1">Creator earnings</p>
          <p className="text-xl font-bold text-primary">{earnings > 0 ? `$${earnings.toFixed(2)}` : "--"}</p>
        </div>
      </div>

      {/* Activity info */}
      <div className="bg-base-100 rounded-xl border border-base-300/60 overflow-hidden">
        <div className="px-5 py-3 border-b border-base-300/60">
          <h2 className="text-sm font-semibold">Activity</h2>
        </div>

        {userStats ? (
          <div className="p-5">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-base-content/50">Total wagered</span>
                <span className="font-medium">${userStats.totalWagered.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-base-content/50">Total won</span>
                <span className="font-medium text-success">${userStats.totalWon.toFixed(2)}</span>
              </div>
              {earnings > 0 && (
                <div className="flex justify-between">
                  <span className="text-base-content/50">Creator fee income</span>
                  <span className="font-medium text-primary">${earnings.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-16 text-center">
            <p className="text-sm text-base-content/40">No bets placed yet</p>
            <p className="text-xs text-base-content/30 mt-1">Your history will appear here after placing bets</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
