"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { blo } from "blo";
import type { NextPage } from "next";
import { IdentityBadge } from "~~/components/bankrbets/IdentityBadge";
import {
  type AllTimeLeaderboardEntry,
  type LeaderboardMode,
  type SeasonLeaderboardEntry,
  useLeaderboard,
} from "~~/hooks/bankrbets/useLeaderboard";
import { type ResolvedIdentity, useResolvedAddresses } from "~~/hooks/bankrbets/useResolvedAddresses";
import { getAddressAvatar, getAddressDisplayName, shortenAddress } from "~~/lib/addressDisplay";

const RESOLVED_NAMES_LIMIT = 25;

const fmtUSD = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const fmtPoints = (n: number) => n.toLocaleString();

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

function PodiumCardShell({
  address,
  resolved,
  rank,
  primary,
  primaryClass,
  metaLeft,
  metaRight,
}: {
  address: string;
  resolved?: ResolvedIdentity;
  rank: number;
  primary: string;
  primaryClass: string;
  metaLeft: string;
  metaRight: string;
}) {
  const style = PODIUM_STYLES[rank];
  return (
    <div
      className={`relative bg-base-100 rounded-2xl border-2 ${style.ring} p-5 flex flex-col items-center text-center motion-safe:animate-pop-in ${style.glow}`}
      style={{ animationDelay: `${rank * 80}ms`, animationFillMode: "both" }}
    >
      <div
        className={`absolute -top-2.5 left-1/2 -translate-x-1/2 ${style.badge} text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-white/20`}
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {style.label}
      </div>

      <div className={`${style.size} rounded-full border-2 border-pg-border/50 mt-2 mb-3 overflow-hidden`}>
        {(() => {
          const avatarUrl = getAddressAvatar(resolved);
          return avatarUrl ? (
            <Image src={avatarUrl} alt="" width={64} height={64} className="w-full h-full rounded-full object-cover" />
          ) : (
            <Image
              src={blo(address as `0x${string}`)}
              alt=""
              width={64}
              height={64}
              unoptimized
              className="w-full h-full rounded-full object-cover"
            />
          );
        })()}
      </div>

      <div className="mb-3 w-full min-w-0 text-center">
        <Link
          href={`https://basescan.org/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-base-content hover:text-pg-violet transition-colors truncate block"
        >
          {getAddressDisplayName(address, resolved)}
        </Link>
        {(() => {
          const displayName = getAddressDisplayName(address, resolved);
          const short = shortenAddress(address);
          return displayName.toLowerCase() !== short.toLowerCase() ? (
            <div className="text-[10px] text-pg-muted font-mono truncate" title={address}>
              {short}
            </div>
          ) : null;
        })()}
      </div>

      <div className="flex items-center gap-3 text-[11px]">
        <span className="font-bold text-pg-muted" style={{ fontFamily: "var(--font-heading)" }}>
          {metaLeft}
        </span>
        <span className="w-px h-3 bg-pg-border" />
        <span className="text-pg-muted">{metaRight}</span>
      </div>

      <div className={`mt-3 text-lg font-extrabold ${primaryClass}`} style={{ fontFamily: "var(--font-heading)" }}>
        {primary}
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
      <div className="w-24 flex justify-end flex-shrink-0">
        <div className="h-3 rounded-full bg-pg-border/70 w-12" />
      </div>
      <div className="w-14 hidden sm:flex justify-end flex-shrink-0">
        <div className="h-3 rounded-full bg-pg-border/70 w-6" />
      </div>
      <div className="w-20 flex justify-end flex-shrink-0">
        <div className="h-3 rounded-full bg-pg-border/70 w-12" />
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 0)
    return (
      <span
        className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-pg-amber text-white text-[10px] font-extrabold shadow-sm"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        1
      </span>
    );
  if (rank === 1)
    return (
      <span
        className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-pg-muted/50 text-white text-[10px] font-extrabold"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        2
      </span>
    );
  if (rank === 2)
    return (
      <span
        className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-pg-pink/60 text-white text-[10px] font-extrabold"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        3
      </span>
    );
  return (
    <span
      className="text-xs font-bold text-pg-muted bg-pg-border/40 w-7 h-7 inline-flex items-center justify-center rounded-full"
      style={{ fontFamily: "var(--font-heading)" }}
    >
      {rank + 1}
    </span>
  );
}

function ModeToggle({ mode, onChange }: { mode: LeaderboardMode; onChange: (m: LeaderboardMode) => void }) {
  const optionClass = (active: boolean) =>
    `px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] rounded-full transition-colors ${
      active ? "bg-pg-violet text-white shadow-sm" : "text-pg-muted hover:text-base-content"
    }`;
  return (
    <div className="inline-flex items-center gap-1 rounded-full border-2 border-pg-border bg-base-100 p-1 shadow-pop-soft">
      <button type="button" onClick={() => onChange("season")} className={optionClass(mode === "season")}>
        Season 1
      </button>
      <button type="button" onClick={() => onChange("all-time")} className={optionClass(mode === "all-time")}>
        All-time
      </button>
    </div>
  );
}

const LeaderboardPage: NextPage = () => {
  const [mode, setMode] = useState<LeaderboardMode>("season");
  const { data, isLoading } = useLeaderboard({ mode, watch: false });

  const seasonEntries = useMemo<SeasonLeaderboardEntry[]>(
    () => (data?.mode === "season" && Array.isArray(data.leaderboard) ? data.leaderboard : []),
    [data],
  );
  const allTimeEntries = useMemo<AllTimeLeaderboardEntry[]>(
    () => (data?.mode === "all-time" && Array.isArray(data.leaderboard) ? data.leaderboard : []),
    [data],
  );

  const addresses = useMemo(() => {
    const list = mode === "season" ? seasonEntries.map(e => e.user) : allTimeEntries.map(e => e.address);
    return list.slice(0, RESOLVED_NAMES_LIMIT);
  }, [mode, seasonEntries, allTimeEntries]);
  const { data: resolvedMap } = useResolvedAddresses(addresses);

  const totalEntries = mode === "season" ? seasonEntries.length : allTimeEntries.length;

  // Aggregate stats
  const seasonTotalPoints = seasonEntries.reduce((s, e) => s + e.seasonPoints, 0);
  const seasonTotalEligible = seasonEntries.reduce((s, e) => s + e.eligibleVolumeUSD, 0);
  const allTimeTotalBets = allTimeEntries.reduce((s, e) => s + e.totalBets, 0);
  const allTimeTotalVolume = allTimeEntries.reduce((s, e) => s + e.totalWagered, 0);

  const subtitle =
    mode === "season" ? (
      <>
        Top wallets ranked by{" "}
        <Link href="/season-1" className="text-pg-violet font-bold hover:underline">
          Season 1
        </Link>{" "}
        points
      </>
    ) : (
      <>Top predictors ranked by net profit</>
    );

  const onShare = () => {
    let text: string;
    if (mode === "season") {
      text = `${totalEntries} wallet${totalEntries !== 1 ? "s" : ""} are racing for Season 1 points on @0xAgenticBets\n${fmtPoints(seasonTotalPoints)} pts · $${fmtUSD(seasonTotalEligible)} eligible volume so far 📈\n\nCan you climb the leaderboard? 👇`;
    } else {
      text = `${totalEntries} player${totalEntries !== 1 ? "s" : ""} are battling for the top spot on @0xAgenticBets\n${allTimeTotalBets} bets placed · $${fmtUSD(allTimeTotalVolume)} in volume 📈\n\nCan you beat the leaderboard? 👇`;
    }
    const url = typeof window !== "undefined" ? `${window.location.origin}/leaderboard` : "/leaderboard";
    const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(intent, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex flex-col grow">
      <div className="relative px-6 pt-8 md:pt-12 pb-2 overflow-hidden">
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
            <div className="flex-1">
              <h1
                className="text-2xl md:text-3xl font-extrabold tracking-tight text-base-content"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Leaderboard
              </h1>
              <p className="text-sm text-pg-muted mt-0.5">{subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-6">
            <ModeToggle mode={mode} onChange={setMode} />
          </div>

          {!isLoading && totalEntries > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-8">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-pg-violet/10 text-pg-violet rounded-full px-3 py-1 border border-pg-violet/20">
                {totalEntries}{" "}
                {mode === "season"
                  ? `wallet${totalEntries !== 1 ? "s" : ""}`
                  : `player${totalEntries !== 1 ? "s" : ""}`}
              </span>
              {mode === "season" ? (
                <>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-pg-mint/10 text-pg-mint rounded-full px-3 py-1 border border-pg-mint/20">
                    {fmtPoints(seasonTotalPoints)} pts awarded
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-pg-amber/10 text-pg-amber rounded-full px-3 py-1 border border-pg-amber/20">
                    ${fmtUSD(seasonTotalEligible)} eligible volume
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-pg-mint/10 text-pg-mint rounded-full px-3 py-1 border border-pg-mint/20">
                    {allTimeTotalBets} total bets
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-pg-amber/10 text-pg-amber rounded-full px-3 py-1 border border-pg-amber/20">
                    ${fmtUSD(allTimeTotalVolume)} volume
                  </span>
                </>
              )}
              <button
                type="button"
                onClick={onShare}
                className="sm:ml-auto inline-flex items-center gap-1.5 text-[11px] font-bold bg-black text-white rounded-full px-3 py-1 border border-pg-slate hover:bg-neutral-800 transition-colors"
                aria-label="Share leaderboard on X"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Share on X
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-6 pb-10">
        {/* Top 3 podium */}
        {!isLoading && totalEntries > 0 && (
          <div
            className={`grid gap-3 md:gap-4 mb-8 ${totalEntries === 1 ? "grid-cols-1 max-w-xs mx-auto" : totalEntries === 2 ? "grid-cols-1 sm:grid-cols-2 max-w-lg mx-auto" : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"}`}
          >
            {mode === "season"
              ? seasonEntries
                  .slice(0, 3)
                  .map((entry, i) => (
                    <PodiumCardShell
                      key={entry.user}
                      address={entry.user}
                      resolved={resolvedMap?.get(entry.user.toLowerCase())}
                      rank={i}
                      primary={`${fmtPoints(entry.seasonPoints)} pts`}
                      primaryClass="text-pg-violet"
                      metaLeft={`$${fmtUSD(entry.eligibleVolumeUSD)} vol`}
                      metaRight={`${entry.daysActive} day${entry.daysActive === 1 ? "" : "s"}`}
                    />
                  ))
              : allTimeEntries
                  .slice(0, 3)
                  .map((entry, i) => (
                    <PodiumCardShell
                      key={entry.address}
                      address={entry.address}
                      resolved={resolvedMap?.get(entry.address.toLowerCase())}
                      rank={i}
                      primary={`${entry.netPnL >= 0 ? "+" : ""}$${fmtUSD(entry.netPnL)}`}
                      primaryClass={entry.netPnL >= 0 ? "text-pg-mint" : "text-pg-pink"}
                      metaLeft={`${entry.winRate.toFixed(0)}% WR`}
                      metaRight={`${entry.totalBets} bets`}
                    />
                  ))}
          </div>
        )}

        {/* Full rankings table */}
        <div className="bg-base-100 rounded-2xl border-2 border-pg-border overflow-hidden">
          <div
            className="flex items-center px-3 sm:px-5 py-2.5 sm:py-3 border-b-2 border-pg-border text-[9px] sm:text-[10px] uppercase tracking-wider text-pg-muted font-bold"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            <span className="w-14 flex-shrink-0">Rank</span>
            <span className="flex-1 min-w-0">Address</span>
            {mode === "season" ? (
              <>
                <span className="w-24 text-right flex-shrink-0">Volume</span>
                <span className="w-14 text-right flex-shrink-0 hidden sm:block">Days</span>
                <span className="w-20 text-right flex-shrink-0">Points</span>
              </>
            ) : (
              <>
                <span className="w-20 text-right flex-shrink-0">Win rate</span>
                <span className="w-16 text-right flex-shrink-0 hidden sm:block">Bets</span>
                <span className="w-24 text-right flex-shrink-0">Net P&amp;L</span>
              </>
            )}
          </div>

          {isLoading ? (
            <div>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} i={i} />
              ))}
            </div>
          ) : totalEntries === 0 ? (
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
                {mode === "season" ? "No Season 1 points yet" : "No predictions yet"}
              </p>
              <p className="text-sm text-pg-muted mt-1.5 max-w-xs mx-auto">
                {mode === "season" ? "Place a settled bet to claim the top spot" : "Be the first to place a bet"}
              </p>
            </div>
          ) : mode === "season" ? (
            <div>
              {seasonEntries.map((entry, i) => (
                <div
                  key={entry.user}
                  className={`flex items-center px-3 sm:px-5 py-2.5 sm:py-3.5 border-b-2 border-pg-border/40 last:border-b-0 text-xs sm:text-sm transition-colors motion-safe:animate-pop-in ${
                    i < 3 ? "bg-pg-amber/[0.03] hover:bg-pg-amber/[0.07]" : "hover:bg-pg-cream/50"
                  }`}
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms`, animationFillMode: "both" }}
                >
                  <div className="w-14 flex-shrink-0">
                    <RankBadge rank={i} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <IdentityBadge address={entry.user} resolved={resolvedMap?.get(entry.user.toLowerCase())} />
                  </div>
                  <div className="w-24 text-right flex-shrink-0">
                    <span className="text-xs font-bold text-pg-mint" style={{ fontFamily: "var(--font-heading)" }}>
                      ${fmtUSD(entry.eligibleVolumeUSD)}
                    </span>
                  </div>
                  <div className="w-14 text-right flex-shrink-0 hidden sm:block">
                    <span className="text-xs text-pg-muted font-medium">{entry.daysActive}</span>
                  </div>
                  <div className="w-20 text-right flex-shrink-0">
                    <span className="text-sm font-bold text-pg-violet" style={{ fontFamily: "var(--font-heading)" }}>
                      {fmtPoints(entry.seasonPoints)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              {allTimeEntries.map((entry, i) => (
                <div
                  key={entry.address}
                  className={`flex items-center px-3 sm:px-5 py-2.5 sm:py-3.5 border-b-2 border-pg-border/40 last:border-b-0 text-xs sm:text-sm transition-colors motion-safe:animate-pop-in ${
                    i < 3 ? "bg-pg-amber/[0.03] hover:bg-pg-amber/[0.07]" : "hover:bg-pg-cream/50"
                  }`}
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms`, animationFillMode: "both" }}
                >
                  <div className="w-14 flex-shrink-0">
                    <RankBadge rank={i} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <IdentityBadge address={entry.address} resolved={resolvedMap?.get(entry.address.toLowerCase())} />
                  </div>
                  <div className="w-20 text-right flex-shrink-0">
                    <span
                      className={`text-xs font-bold ${entry.winRate >= 60 ? "text-pg-mint" : entry.winRate >= 40 ? "text-base-content" : "text-pg-pink"}`}
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      {entry.winRate.toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-16 text-right flex-shrink-0 hidden sm:block">
                    <span className="text-xs text-pg-muted font-medium">{entry.totalBets}</span>
                  </div>
                  <div className="w-24 text-right flex-shrink-0">
                    <span
                      className={`text-sm font-bold ${entry.netPnL >= 0 ? "text-pg-mint" : "text-pg-pink"}`}
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      {entry.netPnL >= 0 ? "+" : ""}${fmtUSD(entry.netPnL)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && totalEntries > 0 && (
            <div className="px-5 py-3 border-t-2 border-pg-border bg-pg-cream/30 flex items-center justify-between">
              <span className="text-[10px] text-pg-muted/60 font-mono">
                {totalEntries} ranked {mode === "season" ? "wallet" : "player"}
                {totalEntries !== 1 ? "s" : ""}
              </span>
              <span className="text-[10px] text-pg-muted/60">
                Ranked by {mode === "season" ? "Season 1 points" : "net P&L"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeaderboardPage;
