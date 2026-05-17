import Link from "next/link";
import type { Metadata } from "next";
import { CheckBadgeIcon, NoSymbolIcon, TrophyIcon } from "@heroicons/react/24/outline";
import { SeasonRewardsTable } from "~~/components/bankrbets/SeasonRewardsTable";
import { SEASON_REWARD_META, formatAgbets, getAllSeasonRewards } from "~~/utils/bankrbets/seasonReward";

export const metadata: Metadata = {
  title: "Season 1 Rewards | Agentic Bets",
  description: "Season 1 $AGBETS reward distribution — final amounts, methodology, and verification.",
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function SeasonOneRewardsPage() {
  const rows = getAllSeasonRewards();
  const meta = SEASON_REWARD_META;
  const poolPct = meta.poolBps / 100;
  const generated = new Date(meta.distributionGeneratedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="flex flex-col grow">
      <section className="relative px-6 pt-10 md:pt-14 pb-8 overflow-hidden">
        <div className="absolute top-10 right-[10%] w-14 h-14 rounded-full bg-pg-violet/12 border-2 border-pg-violet/20 motion-safe:animate-float hidden md:block" />
        <div className="absolute top-24 right-[18%] w-8 h-8 rounded-xl bg-pg-amber/15 border-2 border-pg-amber/25 rotate-12 motion-safe:animate-float-slow hidden md:block" />

        <div className="max-w-4xl mx-auto relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-pg-mint/30 bg-pg-mint/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-pg-mint">
            <CheckBadgeIcon className="h-3.5 w-3.5" />
            Distributed · {generated}
          </div>

          <h1
            className="mt-4 text-3xl md:text-5xl font-extrabold tracking-tight text-base-content"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Season 1 rewards are out.
          </h1>
          <p className="mt-4 max-w-xl text-sm md:text-base text-pg-muted leading-relaxed">
            {poolPct}% of the treasury, split linear pro-rata over locked Season 1 points and sent manually on Base to{" "}
            {meta.walletsDistributed} wallets.
          </p>

          <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-pg-violet/20 bg-pg-violet/8 px-4 py-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-pg-violet">Reward pool</p>
              <p className="mt-2 text-sm font-bold text-base-content">
                {formatAgbets(meta.poolHuman, 0)} {meta.token.symbol}
              </p>
            </div>
            <div className="rounded-2xl border border-pg-mint/20 bg-pg-mint/8 px-4 py-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-pg-mint">Distributed</p>
              <p className="mt-2 text-sm font-bold text-base-content">
                {formatAgbets(meta.distributedHuman, 0)} {meta.token.symbol}
              </p>
            </div>
            <div className="rounded-2xl border border-pg-amber/25 bg-pg-amber/10 px-4 py-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#9a7200]">Recipients</p>
              <p className="mt-2 text-sm font-bold text-base-content">{meta.walletsDistributed} wallets</p>
            </div>
            <div className="rounded-2xl border border-pg-pink/20 bg-pg-pink/8 px-4 py-3">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-pg-pink">Curve</p>
              <p className="mt-2 text-sm font-bold text-base-content">Linear pro-rata</p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative px-6 py-8 md:py-10 bg-dots">
        <div className="absolute inset-x-0 top-0 h-px bg-pg-border" />
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <TrophyIcon className="h-5 w-5 text-pg-violet" />
            <h2
              className="text-xl font-extrabold text-base-content uppercase tracking-wide"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Final allocations
            </h2>
          </div>

          <SeasonRewardsTable rows={rows} meta={meta} />

          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-pg-amber/25 bg-pg-amber/8 px-4 py-3 text-xs text-pg-muted leading-relaxed">
            <NoSymbolIcon className="h-4 w-4 shrink-0 text-[#9a7200] mt-0.5" />
            <span>
              The protocol treasury wallet and one internal test wallet were excluded from the reward set. Eligibility
              used settled-round volume only; opposite-side bets, sub-$1 bets, and pending/cancelled rounds did not
              count.
            </span>
          </div>
        </div>
      </section>

      <section className="relative px-6 py-8 md:py-10">
        <div className="absolute inset-x-0 top-0 h-px bg-pg-border" />
        <div className="max-w-4xl mx-auto">
          <div className="rounded-[28px] border-2 border-pg-border bg-base-100/90 p-6 shadow-pop-soft">
            <p
              className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-pg-violet"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Verify it yourself
            </p>
            <p className="mt-3 text-sm text-pg-muted leading-relaxed">
              The frozen snapshot and the distribution math are pinned in the repo. Re-run the deterministic engine
              against the snapshot and you get these exact amounts. Connected wallets can see their own reward on the{" "}
              <Link href="/profile" className="text-pg-violet font-bold hover:underline">
                portfolio page
              </Link>
              .
            </p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl border border-pg-border bg-base-200/40 px-3 py-2.5">
                <p className="font-bold text-pg-muted uppercase tracking-wider text-[10px]">Snapshot commit</p>
                <Link
                  href={`https://github.com/viraj124/agentic-bets/commit/${meta.snapshotGitCommit}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block font-mono text-pg-violet hover:underline truncate"
                >
                  {meta.snapshotGitCommit.slice(0, 10)}
                </Link>
              </div>
              <div className="rounded-xl border border-pg-border bg-base-200/40 px-3 py-2.5">
                <p className="font-bold text-pg-muted uppercase tracking-wider text-[10px]">Token</p>
                <Link
                  href={`https://basescan.org/token/${meta.token.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block font-mono text-pg-violet hover:underline truncate"
                >
                  {short(meta.token.address)}
                </Link>
              </div>
              <div className="rounded-xl border border-pg-border bg-base-200/40 px-3 py-2.5">
                <p className="font-bold text-pg-muted uppercase tracking-wider text-[10px]">Chain</p>
                <p className="mt-1 font-bold text-base-content">Base ({meta.chainId})</p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Link href="/leaderboard" className="btn-candy text-sm text-center">
              Season 1 leaderboard
            </Link>
            <Link href="/season-1" className="btn-outline-geo text-sm text-center">
              Rules &amp; methodology
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
