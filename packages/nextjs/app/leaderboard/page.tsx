"use client";

import { useMemo } from "react";
import Image from "next/image";
import type { NextPage } from "next";
import { IdentityBadge } from "~~/components/bankrbets/IdentityBadge";
import { useLeaderboard } from "~~/hooks/bankrbets/useLeaderboard";
import { type ResolvedIdentity, useResolvedAddresses } from "~~/hooks/bankrbets/useResolvedAddresses";

const RESOLVED_NAMES_LIMIT = 25;

const PODIUM_STYLES = [
  {
    ring: "ring-pg-amber border-pg-amber/40 bg-pg-amber/10",
    badge: "bg-pg-amber text-white",
    label: "1st",
    size: "w-14 h-14",
    glow: "shadow-[0_0_20px_rgba(255,186,73,0.25)]",
  },
  {
    ring: "ring-pg-muted/40 border-pg-muted/30 bg-pg-muted/5",
    badge: "bg-pg-muted/70 text-white",
    label: "2nd",
    size: "w-12 h-12",
    glow: "",
  },
  {
    ring: "ring-pg-pink/40 border-pg-pink/30 bg-pg-pink/5",
    badge: "bg-pg-pink/70 text-white",
    label: "3rd",
    size: "w-12 h-12",
    glow: "",
  },
];

function PodiumCard({
  entry,
  rank,
  resolved,
}: {
  entry: { address: string; netPnL: number; winRate: number; totalBets: number };
  rank: number;
  resolved?: ResolvedIdentity;
}) {
  const style = PODIUM_STYLES[rank];
  return (
    <div
      className={`relative bg-base-100 rounded-2xl border-2 ${style.ring} p-5 flex flex-col items-center text-center motion-safe:animate-pop-in ${style.glow}`}
      style={{ animationDelay: `${rank * 80}ms`, animationFillMode: "both" }}
    >
      {/* Rank badge */}
      <div
        className={`absolute -top-2.5 left-1/2 -translate-x-1/2 ${style.badge} text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-white/20`}
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {style.label}
      </div>

      {/* Avatar circle */}
      <div
        className={`${style.size} rounded-full bg-pg-border/30 border-2 border-pg-border/50 flex items-center justify-center mt-2 mb-3 overflow-hidden`}
      >
        {resolved?.ensAvatar || resolved?.baseAvatar ? (
          <Image
            src={(resolved.ensAvatar || resolved.baseAvatar)!}
            alt=""
            width={64}
            height={64}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          <svg
            className="w-6 h-6 text-pg-muted/30"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
            />
          </svg>
        )}
      </div>

      {/* Name */}
      <div className="mb-3 w-full min-w-0">
        <IdentityBadge address={entry.address} resolved={resolved} />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-[11px]">
        <span className="font-bold text-pg-muted" style={{ fontFamily: "var(--font-heading)" }}>
          {entry.winRate.toFixed(0)}% WR
        </span>
        <span className="w-px h-3 bg-pg-border" />
        <span className="text-pg-muted">{entry.totalBets} bets</span>
      </div>

      {/* P&L */}
      <div
        className={`mt-3 text-lg font-extrabold ${entry.netPnL >= 0 ? "text-pg-mint" : "text-pg-pink"}`}
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {entry.netPnL >= 0 ? "+" : ""}${entry.netPnL.toFixed(2)}
      </div>
    </div>
  );
}

function SkeletonRow({ i }: { i: number }) {
  return (
    <div
      className="flex items-center px-5 py-3.5 border-b-2 border-pg-border/40 last:border-b-0 animate-pulse"
      style={{ animationDelay: `${i * 80}ms` }}
    >
      <div className="w-14 flex-shrink-0">
        <div className="w-7 h-7 rounded-full bg-pg-border/70" />
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-full bg-pg-border/70 flex-shrink-0" />
        <div className="h-3 rounded-full bg-pg-border/70 w-28 sm:w-40" />
      </div>
      <div className="w-20 flex justify-end flex-shrink-0">
        <div className="h-3 rounded-full bg-pg-border/70 w-10" />
      </div>
      <div className="w-16 hidden sm:flex justify-end flex-shrink-0">
        <div className="h-3 rounded-full bg-pg-border/70 w-6" />
      </div>
      <div className="w-24 flex justify-end flex-shrink-0">
        <div className="h-3 rounded-full bg-pg-border/70 w-14" />
      </div>
    </div>
  );
}

const LeaderboardPage: NextPage = () => {
  const { leaderboard, isLoading } = useLeaderboard({ watch: false });
  const addresses = useMemo(
    () => leaderboard.slice(0, RESOLVED_NAMES_LIMIT).map(entry => entry.address),
    [leaderboard],
  );
  const { data: resolvedMap } = useResolvedAddresses(addresses);

  const top3 = leaderboard.slice(0, 3);

  // Aggregate stats
  const totalBets = leaderboard.reduce((s, e) => s + e.totalBets, 0);
  const totalVolume = leaderboard.reduce((s, e) => s + e.totalWagered, 0);
  const totalPlayers = leaderboard.length;

  return (
    <div className="flex flex-col grow">
      {/* Hero header with decorations */}
      <div className="relative px-6 pt-8 md:pt-12 pb-2 overflow-hidden">
        {/* Floating geometric decorations */}
        <div className="absolute top-8 right-[12%] w-14 h-14 rounded-full bg-pg-amber/15 border-2 border-pg-amber/25 motion-safe:animate-float hidden md:block" />
        <div className="absolute top-20 right-[6%] w-7 h-7 rounded-lg bg-pg-violet/15 border-2 border-pg-violet/25 rotate-12 motion-safe:animate-float-slow hidden md:block" />
        <div className="absolute top-12 left-[8%] w-10 h-10 rounded-xl bg-pg-pink/10 border-2 border-pg-pink/20 -rotate-6 motion-safe:animate-float-slow hidden lg:block" />

        <div className="max-w-4xl mx-auto relative">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-pg-amber border-2 border-pg-slate flex items-center justify-center shadow-pop flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.04 6.04 0 0 1-2.27.79 6.04 6.04 0 0 1-2.27-.79"
                />
              </svg>
            </div>
            <div>
              <h1
                className="text-2xl md:text-3xl font-extrabold tracking-tight text-base-content"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Leaderboard
              </h1>
              <p className="text-sm text-pg-muted mt-0.5">Top predictors ranked by net profit</p>
            </div>
          </div>

          {/* Summary stat pills */}
          {!isLoading && leaderboard.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-8">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-pg-violet/10 text-pg-violet rounded-full px-3 py-1 border border-pg-violet/20">
                {totalPlayers} player{totalPlayers !== 1 ? "s" : ""}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-pg-mint/10 text-pg-mint rounded-full px-3 py-1 border border-pg-mint/20">
                {totalBets} total bets
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-pg-amber/10 text-pg-amber rounded-full px-3 py-1 border border-pg-amber/20">
                ${totalVolume.toFixed(2)} volume
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-6 pb-10">
        {/* Top 3 podium cards */}
        {!isLoading && top3.length > 0 && (
          <div
            className={`grid gap-4 mb-8 ${top3.length === 1 ? "grid-cols-1 max-w-xs mx-auto" : top3.length === 2 ? "grid-cols-2 max-w-lg mx-auto" : "grid-cols-1 sm:grid-cols-3"}`}
          >
            {top3.map((entry, i) => (
              <PodiumCard
                key={entry.address}
                entry={entry}
                rank={i}
                resolved={resolvedMap?.get(entry.address.toLowerCase())}
              />
            ))}
          </div>
        )}

        {/* Full rankings table */}
        <div className="bg-base-100 rounded-2xl border-2 border-pg-border overflow-hidden">
          {/* Table header */}
          <div
            className="flex items-center px-5 py-3 border-b-2 border-pg-border text-[10px] uppercase tracking-wider text-pg-muted font-bold"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <span className="w-14 flex-shrink-0">Rank</span>
            <span className="flex-1 min-w-0">Address</span>
            <span className="w-20 text-right flex-shrink-0">Win rate</span>
            <span className="w-16 text-right flex-shrink-0 hidden sm:block">Bets</span>
            <span className="w-24 text-right flex-shrink-0">Net P&amp;L</span>
          </div>

          {isLoading ? (
            <div>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} i={i} />
              ))}
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-pg-amber/10 border-2 border-pg-amber/20 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-pg-amber/40"
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
              <p className="text-lg font-extrabold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
                No predictions yet
              </p>
              <p className="text-sm text-pg-muted mt-1.5 max-w-xs mx-auto">
                Be the first to place a bet and claim the top spot
              </p>
            </div>
          ) : (
            <div>
              {leaderboard.map((entry, i) => {
                const isTop3 = i < 3;
                return (
                  <div
                    key={entry.address}
                    className={`flex items-center px-5 py-3.5 border-b-2 border-pg-border/40 last:border-b-0 text-sm transition-colors motion-safe:animate-pop-in ${
                      isTop3 ? "bg-pg-amber/[0.03] hover:bg-pg-amber/[0.07]" : "hover:bg-pg-cream/50"
                    }`}
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms`, animationFillMode: "both" }}
                  >
                    {/* Rank */}
                    <div className="w-14 flex-shrink-0">
                      {i === 0 ? (
                        <span
                          className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-pg-amber text-white text-[10px] font-extrabold shadow-sm"
                          style={{ fontFamily: "var(--font-heading)" }}
                        >
                          1
                        </span>
                      ) : i === 1 ? (
                        <span
                          className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-pg-muted/50 text-white text-[10px] font-extrabold"
                          style={{ fontFamily: "var(--font-heading)" }}
                        >
                          2
                        </span>
                      ) : i === 2 ? (
                        <span
                          className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-pg-pink/60 text-white text-[10px] font-extrabold"
                          style={{ fontFamily: "var(--font-heading)" }}
                        >
                          3
                        </span>
                      ) : (
                        <span
                          className="text-xs font-bold text-pg-muted bg-pg-border/40 w-7 h-7 inline-flex items-center justify-center rounded-full"
                          style={{ fontFamily: "var(--font-heading)" }}
                        >
                          {i + 1}
                        </span>
                      )}
                    </div>

                    {/* Address */}
                    <div className="flex-1 min-w-0">
                      <IdentityBadge address={entry.address} resolved={resolvedMap?.get(entry.address.toLowerCase())} />
                    </div>

                    {/* Win rate */}
                    <div className="w-20 text-right flex-shrink-0">
                      <span
                        className={`text-xs font-bold ${entry.winRate >= 60 ? "text-pg-mint" : entry.winRate >= 40 ? "text-base-content" : "text-pg-pink"}`}
                        style={{ fontFamily: "var(--font-heading)" }}
                      >
                        {entry.winRate.toFixed(0)}%
                      </span>
                    </div>

                    {/* Bets */}
                    <div className="w-16 text-right flex-shrink-0 hidden sm:block">
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
                );
              })}
            </div>
          )}

          {/* Table footer */}
          {!isLoading && leaderboard.length > 0 && (
            <div className="px-5 py-3 border-t-2 border-pg-border bg-pg-cream/30 flex items-center justify-between">
              <span className="text-[10px] text-pg-muted/60 font-mono">
                {leaderboard.length} ranked player{leaderboard.length !== 1 ? "s" : ""}
              </span>
              <span className="text-[10px] text-pg-muted/60">Ranked by net P&amp;L</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeaderboardPage;
