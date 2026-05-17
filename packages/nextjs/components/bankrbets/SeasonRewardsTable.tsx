"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useResolvedAddresses } from "~~/hooks/bankrbets/useResolvedAddresses";
import { getAddressDisplayName, shortenAddress } from "~~/lib/addressDisplay";
import { type SeasonRewardMeta, type SeasonRewardRow, formatAgbets } from "~~/utils/bankrbets/seasonReward";

const RANK_TONE = ["text-pg-amber", "text-pg-muted", "text-pg-pink"];

export function SeasonRewardsTable({ rows, meta }: { rows: SeasonRewardRow[]; meta: SeasonRewardMeta }) {
  const addresses = useMemo(() => rows.map(r => r.wallet), [rows]);
  const { data: resolvedMap } = useResolvedAddresses(addresses);

  return (
    <div className="bg-base-100 rounded-2xl border-2 border-pg-border overflow-hidden">
      <div
        className="flex items-center gap-3 sm:gap-5 px-4 sm:px-5 py-3 border-b-2 border-pg-border text-[10px] uppercase tracking-wider text-pg-muted font-bold"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        <span className="w-10 flex-shrink-0">Rank</span>
        <span className="flex-1 min-w-0">Wallet</span>
        <span className="w-14 text-right flex-shrink-0 hidden sm:block">Points</span>
        <span className="w-20 text-right flex-shrink-0">Share</span>
        <span className="w-36 text-right flex-shrink-0">{meta.token.symbol}</span>
      </div>

      {rows.map((r, i) => {
        const resolved = resolvedMap?.get(r.wallet.toLowerCase());
        const displayName = getAddressDisplayName(r.wallet, resolved);
        const isName = displayName.toLowerCase() !== shortenAddress(r.wallet).toLowerCase();
        return (
          <div
            key={r.wallet}
            className={`flex items-center gap-3 sm:gap-5 px-4 sm:px-5 py-3 border-b border-pg-border/40 last:border-b-0 text-xs sm:text-sm ${
              i < 3 ? "bg-pg-amber/[0.03]" : ""
            }`}
          >
            <span
              className={`w-10 flex-shrink-0 font-extrabold ${RANK_TONE[i] ?? "text-pg-muted"}`}
              style={{ fontFamily: "var(--font-heading)" }}
            >
              #{r.rank}
            </span>
            <Link
              href={`https://basescan.org/address/${r.wallet}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-0 hover:underline"
            >
              <span className={`block truncate ${isName ? "font-bold text-base-content" : "font-mono text-pg-violet"}`}>
                {displayName}
              </span>
              {isName ? (
                <span className="block truncate font-mono text-[10px] text-pg-muted">{shortenAddress(r.wallet)}</span>
              ) : null}
            </Link>
            <span className="w-14 text-right flex-shrink-0 text-pg-muted hidden sm:block tabular-nums">
              {(Number(r.pointsE6) / 1_000_000).toLocaleString()}
            </span>
            <span className="w-20 text-right flex-shrink-0 text-pg-muted tabular-nums">{r.sharePct}%</span>
            <span
              className="w-36 text-right flex-shrink-0 font-bold text-base-content tabular-nums"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {formatAgbets(r.amountHuman)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
