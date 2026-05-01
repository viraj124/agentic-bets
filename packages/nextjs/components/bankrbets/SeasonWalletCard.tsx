"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { ArrowTrendingUpIcon, ExclamationTriangleIcon, SparklesIcon, WalletIcon } from "@heroicons/react/24/outline";
import { useResolvedAddresses } from "~~/hooks/bankrbets/useResolvedAddresses";
import { useSeasonPoints } from "~~/hooks/bankrbets/useSeasonPoints";
import { getAddressDisplayName } from "~~/lib/addressDisplay";
import type { WalletPoints } from "~~/utils/bankrbets/seasonPoints";

const fmtUSD = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const fmtPoints = (n: number) => n.toLocaleString();

function StatTile({
  label,
  value,
  hint,
  tone = "violet",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "violet" | "mint" | "amber" | "pink";
}) {
  const toneClass = {
    violet: "border-pg-violet/20 bg-pg-violet/8",
    mint: "border-pg-mint/20 bg-pg-mint/8",
    amber: "border-pg-amber/25 bg-pg-amber/10",
    pink: "border-pg-pink/20 bg-pg-pink/8",
  }[tone];

  return (
    <div className={`rounded-2xl border-2 ${toneClass} px-4 py-3`}>
      <p
        className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-pg-muted"
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {label}
      </p>
      <p className="mt-2 text-xl font-extrabold text-base-content">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-pg-muted">{hint}</p> : null}
    </div>
  );
}

function ConnectedView({ wallet }: { wallet: WalletPoints }) {
  const reviewing = wallet.reviewStatus === "review";
  const excluded = wallet.reviewStatus === "excluded";

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Season points"
          value={fmtPoints(wallet.seasonPoints)}
          hint={
            wallet.firstBetBonusPoints > 0
              ? `${fmtPoints(wallet.baseVolumePoints)} base + ${fmtPoints(wallet.firstBetBonusPoints)} bonus`
              : undefined
          }
          tone="violet"
        />
        <StatTile
          label="Eligible volume"
          value={`$${fmtUSD(wallet.eligibleVolumeUSD)}`}
          hint={wallet.cappedVolumeUSD > 0 ? `$${fmtUSD(wallet.cappedVolumeUSD)} above daily cap` : undefined}
          tone="mint"
        />
        <StatTile
          label="First-bet bonus"
          value={wallet.firstBetUnlocked ? "Unlocked" : "Locked"}
          hint={wallet.firstBetUnlocked ? "+10 bonus credited" : "Unlocks at $10 eligible volume"}
          tone="amber"
        />
        <StatTile
          label="Review status"
          value={excluded ? "Excluded" : reviewing ? "Under review" : "Clear"}
          hint={
            excluded
              ? "Removed from final standings"
              : reviewing
                ? "Eligibility being verified"
                : wallet.excludedBets > 0
                  ? `${wallet.excludedBets} bet${wallet.excludedBets === 1 ? "" : "s"} not counted`
                  : undefined
          }
          tone={excluded ? "pink" : reviewing ? "amber" : "violet"}
        />
      </div>

      {wallet.exclusionReasons.length > 0 ? (
        <div className="rounded-2xl border border-pg-amber/25 bg-pg-amber/8 px-4 py-3 text-xs text-pg-muted leading-relaxed">
          <span className="inline-flex items-center gap-1.5 font-bold text-[#9a7200]">
            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
            Excluded bet reasons:
          </span>{" "}
          {wallet.exclusionReasons.join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

function DisconnectedView() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border-2 border-dashed border-pg-border bg-base-200/30 px-5 py-5">
      <div className="flex items-center gap-2 text-pg-muted">
        <WalletIcon className="h-5 w-5" />
        <p className="text-sm font-bold text-base-content">Connect a wallet to track your Season 1 points.</p>
      </div>
      <p className="text-xs text-pg-muted leading-relaxed max-w-md">
        Connected wallets see live season points, eligible volume, and first-bet status as bets settle.
      </p>
    </div>
  );
}

function LoadingView() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl border-2 border-pg-border bg-base-200/40 px-4 py-5 animate-pulse">
          <div className="h-3 w-20 rounded bg-pg-border/60" />
          <div className="mt-3 h-6 w-24 rounded bg-pg-border/50" />
        </div>
      ))}
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border-2 border-pg-pink/25 bg-pg-pink/8 px-4 py-3 text-sm text-pg-muted">
      Couldn&apos;t load season points: {message}
    </div>
  );
}

export function SeasonWalletCard() {
  const { address, isConnected } = useAccount();
  const { data, isLoading, error } = useSeasonPoints(isConnected ? address : undefined);

  const resolvedInput = useMemo(() => (isConnected && address ? [address] : []), [isConnected, address]);
  const { data: resolvedMap } = useResolvedAddresses(resolvedInput);
  const displayName =
    isConnected && address ? getAddressDisplayName(address, resolvedMap?.get(address.toLowerCase())) : null;

  return (
    <div className="rounded-[28px] border-2 border-pg-border bg-base-100/90 p-6 shadow-pop-soft">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 min-w-0">
          <SparklesIcon className="h-5 w-5 text-pg-violet shrink-0" />
          <h2
            className="text-base font-extrabold uppercase tracking-wide text-base-content mb-0 truncate"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {displayName ? `${displayName} · Season 1` : "Your Season 1"}
          </h2>
        </div>
        {data?.wallet?.daysActive ? (
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-pg-muted">
            <ArrowTrendingUpIcon className="inline h-3 w-3 mr-1" />
            {data.wallet.daysActive} active day{data.wallet.daysActive === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>

      {!isConnected ? (
        <DisconnectedView />
      ) : isLoading && !data ? (
        <LoadingView />
      ) : error ? (
        <ErrorView message={error instanceof Error ? error.message : "unknown error"} />
      ) : data?.wallet ? (
        <ConnectedView wallet={data.wallet} />
      ) : (
        <LoadingView />
      )}
    </div>
  );
}
