"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { CheckBadgeIcon, GiftIcon } from "@heroicons/react/24/outline";
import { useSeasonReward } from "~~/hooks/bankrbets/useSeasonReward";
import { formatAgbets } from "~~/utils/bankrbets/seasonReward";

export function SeasonRewardCard() {
  const { address, isConnected } = useAccount();
  const { data, isLoading } = useSeasonReward(isConnected ? address : undefined);

  // Hide entirely for disconnected wallets or wallets not in the distribution —
  // this is a results card, not a call to action.
  if (!isConnected || isLoading || !data?.reward) return null;

  const { reward, meta } = data;
  const tokenUrl = `https://basescan.org/token/${meta.token.address}?a=${reward.wallet}`;

  return (
    <div className="rounded-[28px] border-2 border-pg-violet/30 bg-gradient-to-br from-pg-violet/[0.10] to-pg-pink/[0.06] p-6 shadow-pop-soft">
      <div className="flex items-center gap-2 mb-4">
        <GiftIcon className="h-5 w-5 text-pg-violet" />
        <h2
          className="text-base font-extrabold uppercase tracking-wide text-base-content mb-0"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Season 1 reward
        </h2>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-pg-mint/30 bg-pg-mint/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.18em] text-pg-mint">
          <CheckBadgeIcon className="h-3 w-3" />
          Distributed
        </span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p
            className="text-3xl md:text-4xl font-extrabold text-base-content"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {formatAgbets(reward.amountHuman)} <span className="text-lg text-pg-violet">{meta.token.symbol}</span>
          </p>
          <p className="mt-1 text-xs text-pg-muted">
            Rank #{reward.rank} · {reward.sharePct}% of the reward pool · sent on Base
          </p>
        </div>
        <Link
          href={tokenUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-outline-geo text-xs text-center self-start sm:self-auto"
        >
          View on BaseScan
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-pg-border bg-base-100/70 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-pg-muted">Season points</p>
          <p className="mt-0.5 text-sm font-extrabold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
            {(Number(reward.pointsE6) / 1_000_000).toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-pg-border bg-base-100/70 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-pg-muted">Pool share</p>
          <p className="mt-0.5 text-sm font-extrabold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
            {reward.sharePct}%
          </p>
        </div>
        <div className="rounded-xl border border-pg-border bg-base-100/70 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-pg-muted">Rank</p>
          <p className="mt-0.5 text-sm font-extrabold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
            #{reward.rank}
          </p>
        </div>
      </div>

      <p className="mt-4 text-[11px] text-pg-muted leading-relaxed">
        Computed by linear pro-rata over locked Season 1 points and distributed manually on Base. Verifiable against
        repo commit{" "}
        <Link
          href={`https://github.com/viraj124/agentic-bets/commit/${meta.snapshotGitCommit}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-pg-violet hover:underline"
        >
          {meta.snapshotGitCommit.slice(0, 7)}
        </Link>
        .
      </p>
    </div>
  );
}
