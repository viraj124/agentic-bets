"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { IdentityBadge } from "~~/components/bankrbets/IdentityBadge";
import { useResolvedAddresses } from "~~/hooks/bankrbets/useResolvedAddresses";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

interface UserStats {
  address: string;
  totalBets: number;
  totalWagered: number;
  totalWon: number;
  netPnL: number;
  wins: number;
  winRate: number;
}

type BetOutcome = "ongoing" | "won" | "lost" | "refund" | "pending";

interface UserBetItem {
  id: string;
  tokenAddress: string;
  epoch: number;
  amount: number;
  side: "up" | "down";
  claimed: boolean;
  claimedAmount: number;
  isOngoing: boolean;
  outcome: BetOutcome;
  expectedPayout: number;
  href: string;
  placedAt: number;
}

interface UserBetsResponse {
  ongoing: UserBetItem[];
  previous: UserBetItem[];
  updatedAt: number;
}

interface BankrTokenSymbol {
  address: string;
  symbol: string;
}

const USER_STATS_CACHE_TTL_MS = 5 * 60_000;
const userStatsClientCache = new Map<string, { ts: number; data: UserStats | null }>();
const USER_BETS_CACHE_TTL_MS = 60_000;
const userBetsClientCache = new Map<string, { ts: number; data: UserBetsResponse }>();

function useUserStats(address: string | undefined) {
  const key = address?.toLowerCase();
  const cached = key ? userStatsClientCache.get(key) : undefined;
  const freshCached = cached && Date.now() - cached.ts < USER_STATS_CACHE_TTL_MS ? cached.data : undefined;

  return useQuery<UserStats | null>({
    queryKey: ["user-stats", key],
    queryFn: async () => {
      if (!address) return null;
      const res = await fetch(`/api/user-stats?address=${address}`, {
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const stats = (json.stats as UserStats) ?? null;
      userStatsClientCache.set(address.toLowerCase(), { ts: Date.now(), data: stats });
      return stats;
    },
    enabled: !!address,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 5000),
    initialData: freshCached,
    placeholderData: previous => previous,
  });
}

function StatCardSkeleton() {
  return (
    <div className="bg-base-100 rounded-xl sm:rounded-2xl border-2 border-pg-border p-3 sm:p-4 animate-pulse">
      <div className="h-2 rounded-full bg-pg-border/70 w-14 mb-3" />
      <div className="h-6 rounded-full bg-pg-border/70 w-20" />
    </div>
  );
}

function useUserBets(address: string | undefined) {
  const key = address?.toLowerCase();
  const cached = key ? userBetsClientCache.get(key) : undefined;
  const freshCached = cached && Date.now() - cached.ts < USER_BETS_CACHE_TTL_MS ? cached.data : undefined;

  return useQuery<UserBetsResponse>({
    queryKey: ["user-bets", key],
    queryFn: async () => {
      if (!address) return { ongoing: [], previous: [], updatedAt: Date.now() };
      const res = await fetch(`/api/user-bets?address=${address}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as UserBetsResponse;
      userBetsClientCache.set(address.toLowerCase(), { ts: Date.now(), data: json });
      return json;
    },
    enabled: !!address,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 5000),
    initialData: freshCached,
    placeholderData: previous => previous,
  });
}

function formatBetDate(timestampS: number) {
  if (!timestampS || timestampS <= 0) return "Unknown time";
  return new Date(timestampS * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTokenShort(address: string) {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const ProfilePage: NextPage = () => {
  const { address } = useAccount();
  const {
    data: userStats,
    isLoading: isStatsLoading,
    isError: isStatsError,
    refetch: refetchStats,
  } = useUserStats(address);
  const { data: userBets, isLoading: isBetsLoading, isError: isBetsError, refetch: refetchBets } = useUserBets(address);
  const { data: resolvedMap } = useResolvedAddresses(address ? [address] : []);
  const { data: tokenSymbolMap } = useQuery<Map<string, string>>({
    queryKey: ["bankr-token-symbols"],
    queryFn: async () => {
      const res = await fetch("/api/bankr-tokens", {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return new Map<string, string>();
      const json = (await res.json()) as { tokens?: BankrTokenSymbol[] };
      const map = new Map<string, string>();
      for (const token of json.tokens ?? []) {
        const addr = token.address?.toLowerCase();
        const symbol = token.symbol?.trim();
        if (!addr || !symbol) continue;
        map.set(addr, symbol);
      }
      return map;
    },
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const { data: creatorEarnings, isLoading: isEarningsLoading } = useScaffoldReadContract({
    contractName: "BankrBetsPrediction",
    functionName: "creatorEarnings",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    watch: false,
    query: {
      enabled: !!address,
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
    },
  });

  const earnings = creatorEarnings ? Number(creatorEarnings) / 1e6 : 0;
  const ongoingBets = userBets?.ongoing ?? [];
  const previousBets = userBets?.previous ?? [];

  const hasStats = !!userStats && userStats.totalBets > 0;
  const hasListedBets = ongoingBets.length > 0 || previousBets.length > 0;
  const hasBets = hasStats || hasListedBets;

  const statCards = useMemo(
    () => [
      { label: "Total bets", value: hasStats ? String(userStats!.totalBets) : "--", color: "" },
      { label: "Wins", value: hasStats ? String(userStats!.wins) : "--", color: "" },
      {
        label: "Win rate",
        value: hasStats ? `${userStats!.winRate.toFixed(0)}%` : "--",
        color: "",
      },
      {
        label: "Net P&L",
        value: hasStats ? `${userStats!.netPnL >= 0 ? "+" : ""}$${userStats!.netPnL.toFixed(2)}` : "--",
        color: hasStats ? (userStats!.netPnL >= 0 ? "text-pg-mint" : "text-pg-pink") : "",
      },
      {
        label: "Creator earnings",
        value: isEarningsLoading ? "..." : `$${earnings.toFixed(2)}`,
        color: "text-pg-violet",
      },
    ],
    [hasStats, userStats, earnings, isEarningsLoading],
  );

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

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="min-w-0">
          <h1
            className="text-2xl font-extrabold tracking-tight text-base-content"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Portfolio
          </h1>
          <p className="text-sm text-pg-muted">Track your bets, wins, and creator earnings</p>
          <div className="mt-2 inline-flex bg-base-100 rounded-xl border border-pg-border px-2.5 py-1.5">
            <IdentityBadge address={address} resolved={resolvedMap?.get(address.toLowerCase())} size="md" />
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-6 sm:mb-8">
        {isStatsLoading
          ? Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
          : statCards.map(stat => (
              <div
                key={stat.label}
                className="bg-base-100 rounded-2xl border-2 border-pg-border p-4 hover:border-pg-slate/40 transition-colors motion-safe:animate-pop-in"
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

        {isBetsLoading ? (
          <div className="p-5 space-y-4 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="h-3 rounded-full bg-pg-border/70 w-40" />
                <div className="h-3 rounded-full bg-pg-border/70 w-24" />
              </div>
            ))}
          </div>
        ) : isStatsError || isBetsError ? (
          <div className="py-12 text-center px-4">
            <p className="text-sm font-bold text-base-content mb-1" style={{ fontFamily: "var(--font-heading)" }}>
              Unable to load portfolio
            </p>
            <p className="text-xs text-pg-muted/70">Please try again in a few seconds.</p>
            <button
              type="button"
              className="inline-block mt-5 btn-candy text-xs px-6 py-2.5"
              onClick={() => {
                void refetchStats();
                void refetchBets();
              }}
            >
              Retry
            </button>
          </div>
        ) : hasBets ? (
          <div className="p-4 sm:p-5 space-y-5">
            {ongoingBets.length > 0 && (
              <div>
                <p
                  className="text-[10px] text-pg-muted uppercase tracking-wider font-bold mb-2"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Ongoing
                </p>
                <div className="space-y-2">
                  {ongoingBets.map(bet => (
                    <Link
                      key={bet.id}
                      href={bet.href}
                      className="block rounded-xl border border-pg-border bg-base-200/30 hover:border-pg-violet/40 transition-colors px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-base-content truncate">
                            Round #{bet.epoch} ·{" "}
                            {tokenSymbolMap?.get(bet.tokenAddress.toLowerCase()) || formatTokenShort(bet.tokenAddress)}
                          </p>
                          <p className="text-[11px] text-pg-muted mt-0.5">{formatBetDate(bet.placedAt)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className="text-xs font-extrabold text-base-content"
                            style={{ fontFamily: "var(--font-heading)" }}
                          >
                            ${bet.amount.toFixed(2)}
                          </p>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              bet.side === "up"
                                ? "bg-pg-mint/15 text-pg-mint border-pg-mint/30"
                                : "bg-pg-pink/15 text-pg-pink border-pg-pink/30"
                            }`}
                          >
                            {bet.side === "up" ? "\u2191 UP" : "\u2193 DOWN"}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {previousBets.length > 0 && (
              <div>
                <p
                  className="text-[10px] text-pg-muted uppercase tracking-wider font-bold mb-2"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Previous
                </p>
                <div className="space-y-2">
                  {previousBets.map(bet => (
                    <Link
                      key={bet.id}
                      href={bet.href}
                      className="block rounded-xl border border-pg-border bg-base-200/30 hover:border-pg-violet/40 transition-colors px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-base-content truncate">
                            Round #{bet.epoch} ·{" "}
                            {tokenSymbolMap?.get(bet.tokenAddress.toLowerCase()) || formatTokenShort(bet.tokenAddress)}
                          </p>
                          <p className="text-[11px] text-pg-muted mt-0.5">{formatBetDate(bet.placedAt)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p
                              className="text-xs font-extrabold text-base-content"
                              style={{ fontFamily: "var(--font-heading)" }}
                            >
                              ${bet.amount.toFixed(2)}
                            </p>
                            {bet.outcome === "won" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-pg-mint/15 text-pg-mint border-pg-mint/30 mt-0.5">
                                Won ${(bet.claimed ? bet.claimedAmount : bet.expectedPayout).toFixed(2)}
                              </span>
                            ) : bet.outcome === "refund" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-pg-amber/15 text-pg-amber border-pg-amber/30 mt-0.5">
                                {bet.claimed ? "Refunded" : "Refund available"}
                              </span>
                            ) : bet.outcome === "pending" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-pg-violet/15 text-pg-violet border-pg-violet/30 mt-0.5">
                                {bet.side === "up" ? "\u2191 UP" : "\u2193 DOWN"} · Pending
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-pg-pink/15 text-pg-pink border-pg-pink/30 mt-0.5">
                                {bet.side === "up" ? "\u2191 UP" : "\u2193 DOWN"} · Lost
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {userStats && hasStats && (
              <div className="pt-1 border-t border-pg-border/70 space-y-1.5">
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
              </div>
            )}
          </div>
        ) : (
          <div className="py-16 text-center">
            <p className="text-sm font-bold text-base-content mb-1" style={{ fontFamily: "var(--font-heading)" }}>
              No bets yet
            </p>
            <p className="text-xs text-pg-muted/70 mt-1">Your history will appear here after your first bet</p>
            <Link href="/" className="inline-block mt-5 btn-candy text-xs px-6 py-2.5">
              Find a market
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
