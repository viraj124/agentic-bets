"use client";

import { useCountdown } from "~~/hooks/bankrbets/useCountdown";

interface RoundTimerProps {
  lockTimestamp: number;
  closeTimestamp: number;
  isLocked: boolean;
  isSettled?: boolean;
  isCancelled?: boolean;
  canClaim?: boolean;
  outcome?: "pending" | "won" | "lost" | "refund" | "refunded" | "claimed" | "cancelled" | "settled";
}

export function RoundTimer({
  lockTimestamp,
  closeTimestamp,
  isLocked,
  isSettled = false,
  isCancelled = false,
  canClaim = false,
  outcome = "pending",
}: RoundTimerProps) {
  const { formatted: lockFormatted, isExpired: lockExpired, timeLeft: lockTimeLeft } = useCountdown(lockTimestamp);
  const { formatted: closeFormatted, isExpired: closeExpired, timeLeft: closeTimeLeft } = useCountdown(closeTimestamp);

  // Bets are "effectively locked" once lockTimestamp passes (even before lockRound() is called on-chain)
  const effectivelyLocked = isLocked || lockExpired;

  // Which timer is active and how urgent is it
  const activeTimeLeft = effectivelyLocked ? closeTimeLeft : lockTimeLeft;
  const isUrgent = activeTimeLeft > 0 && activeTimeLeft <= 30;

  let label: string;
  let timer: string;
  let sublabel: string;
  let chipClass = "bg-base-200/70 text-pg-muted border-pg-border/60";
  let timerClass = "text-base-content";
  let sublabelClass = "text-pg-muted/50";
  let dotClass = "bg-pg-violet";
  let dotAnimated = false;

  if (isSettled) {
    if (outcome === "claimed" || outcome === "won") {
      label = "You won 🎉";
      timer = "";
      sublabel = outcome === "won" ? "Claim now" : "";
      chipClass = "bg-pg-mint/15 text-pg-mint border-pg-mint/35";
      sublabelClass = "text-pg-mint/80";
    } else if (outcome === "refunded") {
      label = "Refund claimed";
      timer = "";
      sublabel = "";
      chipClass = "bg-pg-amber/15 text-pg-amber border-pg-amber/35";
      sublabelClass = "text-pg-amber/75";
    } else if (outcome === "lost") {
      label = "Round settled";
      timer = "";
      sublabel = "Better luck next time";
      chipClass = "bg-pg-pink/15 text-pg-pink border-pg-pink/35";
      sublabelClass = "text-pg-pink/75";
    } else if (outcome === "refund" || isCancelled) {
      label = "Round cancelled";
      timer = "";
      sublabel = canClaim ? "Refund available" : "Settlement complete";
      chipClass = "bg-pg-amber/15 text-pg-amber border-pg-amber/35";
      sublabelClass = "text-pg-amber/75";
    } else {
      label = "Round settled";
      timer = "";
      sublabel = canClaim ? "Claim available" : "Settlement complete";
      chipClass = "bg-pg-violet/14 text-pg-violet border-pg-violet/30";
      sublabelClass = "text-pg-violet/75";
    }
  } else if (!effectivelyLocked) {
    label = "Betting closes in";
    timer = lockFormatted;
    sublabel = "Place your bets";
    chipClass = "bg-pg-violet/12 text-pg-violet border-pg-violet/25";
    timerClass = isUrgent ? "text-pg-pink motion-safe:animate-pulse" : "text-base-content";
    sublabelClass = "text-pg-muted/55";
    dotClass = "bg-pg-violet";
    dotAnimated = true;
  } else if (!closeExpired) {
    label = isLocked ? "Round ends in" : "Bets locked · grace period";
    timer = closeFormatted;
    sublabel = isLocked ? "Bets locked" : "Waiting for settlement";
    chipClass = "bg-pg-amber/14 text-pg-amber border-pg-amber/25";
    timerClass = "text-pg-amber";
    sublabelClass = "text-pg-muted/60";
    dotClass = "bg-pg-amber";
    dotAnimated = true;
  } else {
    label = "Settling";
    timer = "--:--";
    sublabel = "Awaiting settlement";
    chipClass = "bg-base-200/70 text-pg-muted border-pg-border/60";
    timerClass = "text-base-content/35";
    sublabelClass = "text-pg-muted/50";
  }

  return (
    <div className="mx-auto w-full max-w-[260px] py-1 text-center transition-all duration-300">
      <div
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${chipClass}`}
      >
        {!isSettled && (
          <span
            className={`h-1.5 w-1.5 rounded-full ${dotClass} ${dotAnimated ? "motion-safe:animate-pulse" : ""}`}
            aria-hidden="true"
          />
        )}
        <span>{isSettled ? label.toUpperCase() : label}</span>
      </div>

      {timer ? (
        <div className={`mt-2 text-3xl font-mono font-bold tabular-nums transition-colors ${timerClass}`}>{timer}</div>
      ) : null}
      {sublabel ? <div className={`mt-1 text-[11px] ${sublabelClass}`}>{sublabel}</div> : null}
    </div>
  );
}
