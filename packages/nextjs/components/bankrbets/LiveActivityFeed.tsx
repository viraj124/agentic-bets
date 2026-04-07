"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ActivityItem } from "~~/app/api/activity/route";
import { type ResolvedIdentity, useResolvedAddresses } from "~~/hooks/bankrbets/useResolvedAddresses";

function shortenAddress(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getDisplayName(addr: string, resolved?: ResolvedIdentity) {
  if (!resolved) return shortenAddress(addr);
  return resolved.baseName || resolved.ensName || resolved.weiName || shortenAddress(addr);
}

function timeAgo(timestampS: number) {
  const diff = Math.floor(Date.now() / 1000 - timestampS);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function TickerPill({
  item,
  tokenSymbol,
  displayName,
}: {
  item: ActivityItem;
  tokenSymbol?: string;
  displayName: string;
}) {
  const isUp = item.side === "up";
  const label = tokenSymbol || shortenAddress(item.tokenAddress);

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-pg-border bg-base-100 px-3 py-1.5 shrink-0">
      {/* Side dot */}
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isUp ? "bg-pg-mint" : "bg-pg-pink"}`} />

      {/* User */}
      <span className="text-[11px] font-bold text-pg-muted whitespace-nowrap">{displayName}</span>

      {/* Separator */}
      <span className="text-pg-border">·</span>

      {/* Side + Token */}
      <span className={`text-[11px] font-extrabold whitespace-nowrap ${isUp ? "text-pg-mint" : "text-pg-pink"}`}>
        {isUp ? "▲" : "▼"}
      </span>
      <span className="text-[11px] font-extrabold text-pg-violet whitespace-nowrap">${label}</span>

      {/* Amount */}
      <span className="text-[11px] font-bold text-base-content whitespace-nowrap">${item.amount.toFixed(2)}</span>

      {/* Time */}
      <span className="text-[10px] text-pg-muted/60 whitespace-nowrap">{timeAgo(item.placedAt)}</span>
    </div>
  );
}

function TickerSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-7 rounded-full bg-pg-border/40 w-48 shrink-0" />
      ))}
    </div>
  );
}

export function LiveActivityFeed() {
  const { data, isLoading } = useQuery<{ activity: ActivityItem[] }>({
    queryKey: ["live-activity"],
    queryFn: async () => {
      const res = await fetch("/api/activity", { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 8_000,
    refetchInterval: 10_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const items = useMemo(() => data?.activity ?? [], [data?.activity]);

  const userAddresses = useMemo(() => items.map(item => item.user), [items]);
  const { data: resolvedMap } = useResolvedAddresses(userAddresses);

  const { data: tokenSymbolMap } = useQuery<Map<string, string>>({
    queryKey: ["bankr-token-symbols-feed"],
    queryFn: async () => {
      const res = await fetch("/api/bankr-tokens", { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return new Map<string, string>();
      const json = (await res.json()) as { tokens?: Array<{ address: string; symbol?: string }> };
      const map = new Map<string, string>();
      for (const t of json.tokens ?? []) {
        if (t.address && t.symbol) map.set(t.address.toLowerCase(), t.symbol.trim());
      }
      return map;
    },
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="w-full bg-base-100 overflow-hidden py-2.5">
        <TickerSkeleton />
      </div>
    );
  }

  if (items.length === 0) return null;

  // Duplicate items to create seamless infinite scroll
  const tickerItems = [...items, ...items];

  return (
    <div className="w-full bg-base-100 overflow-hidden">
      {/* Ticker */}
      <div className="relative overflow-hidden py-2">
        {/* Fade edges */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-r from-base-100 to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-l from-base-100 to-transparent" />

        {/* Live dot + label pinned left */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5 bg-base-100 pr-2">
          <span className="w-1.5 h-1.5 rounded-full bg-pg-mint motion-safe:animate-pulse" />
          <span
            className="text-[9px] font-extrabold uppercase tracking-widest text-pg-muted"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Live
          </span>
        </div>

        {/* Scrolling track */}
        <div className="flex gap-3 animate-ticker hover:[animation-play-state:paused]">
          {tickerItems.map((item, i) => (
            <TickerPill
              key={`${item.id}-${i}`}
              item={item}
              tokenSymbol={tokenSymbolMap?.get(item.tokenAddress.toLowerCase())}
              displayName={getDisplayName(item.user, resolvedMap?.get(item.user.toLowerCase()))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
