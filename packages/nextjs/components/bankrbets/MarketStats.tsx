"use client";

import { useQuery } from "@tanstack/react-query";
import { ChartBarIcon, CurrencyDollarIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { useEligibleTokens } from "~~/hooks/bankrbets/useEligibleTokens";

interface LeaderboardEntry {
  totalBets: number;
  totalWagered: number;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

export function MarketStats() {
  const { tokenCount, isLoading: isTokensLoading } = useEligibleTokens();

  const { data: leaderboardStats, isLoading: isLbLoading } = useQuery<{
    totalBets: number;
    totalVolume: number;
    totalPlayers: number;
  }>({
    queryKey: ["market-stats-aggregate"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard", { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { leaderboard: LeaderboardEntry[] };
      const entries = json.leaderboard ?? [];

      let totalBets = 0;
      let totalVolume = 0;
      for (const entry of entries) {
        totalBets += entry.totalBets;
        totalVolume += entry.totalWagered;
      }

      return { totalBets, totalVolume, totalPlayers: entries.length };
    },
    staleTime: 20_000,
    refetchInterval: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const isLoading = isTokensLoading || isLbLoading;

  const stats = [
    {
      label: "Total Volume",
      value: leaderboardStats ? `$${formatCompact(leaderboardStats.totalVolume)}` : "--",
      icon: CurrencyDollarIcon,
      color: "text-pg-mint bg-pg-mint/10 border-pg-mint/30",
    },
    {
      label: "Total Bets",
      value: leaderboardStats ? formatCompact(leaderboardStats.totalBets) : "--",
      icon: ChartBarIcon,
      color: "text-pg-violet bg-pg-violet/10 border-pg-violet/30",
    },
    {
      label: "Players",
      value: leaderboardStats ? String(leaderboardStats.totalPlayers) : "--",
      icon: UserGroupIcon,
      color: "text-pg-pink bg-pg-pink/10 border-pg-pink/30",
    },
    {
      label: "Active Markets",
      value: tokenCount > 0 ? String(tokenCount) : "--",
      icon: ChartBarIcon,
      color: "text-pg-amber bg-pg-amber/10 border-pg-amber/30",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-5">
      {stats.map(stat => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className={`rounded-xl border-2 border-pg-border bg-base-100/80 px-3 py-2.5 shadow-pop-soft transition-colors hover:border-pg-slate/40 ${isLoading ? "animate-pulse" : "motion-safe:animate-pop-in"}`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${stat.color}`}>
                <Icon className="w-3 h-3" />
              </div>
              <span
                className="text-[10px] font-bold uppercase tracking-wider text-pg-muted"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {stat.label}
              </span>
            </div>
            <p
              className="text-lg font-extrabold text-base-content tracking-tight"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {stat.value}
            </p>
          </div>
        );
      })}
    </div>
  );
}
