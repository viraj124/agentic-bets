"use client";

import { useMemo } from "react";
import { InfoTooltip } from "./InfoTooltip";
import { useCountdown } from "~~/hooks/bankrbets/useCountdown";

interface RoundTimerProps {
  lockTimestamp: number;
  closeTimestamp: number;
  isLocked: boolean;
  isSettled?: boolean;
  isCancelled?: boolean;
  canClaim?: boolean;
  outcome?: "pending" | "won" | "lost" | "refund" | "refunded" | "claimed" | "cancelled" | "settled";
  cancellationReason?: string | null;
  hasBet?: boolean;
}

/** Linear interpolation between two hex colors based on t (0–1). */
function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

const COLOR_VIOLET = "#8B5CF6";
const COLOR_AMBER = "#FBBF24";
const COLOR_PINK = "#F472B6";

export function RoundTimer({
  lockTimestamp,
  closeTimestamp,
  isLocked,
  isSettled = false,
  isCancelled = false,
  canClaim = false,
  outcome = "pending",
  cancellationReason,
  hasBet = false,
}: RoundTimerProps) {
  const { formatted: lockFormatted, isExpired: lockExpired, timeLeft: lockTimeLeft } = useCountdown(lockTimestamp);
  const { formatted: closeFormatted, isExpired: closeExpired, timeLeft: closeTimeLeft } = useCountdown(closeTimestamp);

  // Bets are "effectively locked" once lockTimestamp passes (even before lockRound() is called on-chain)
  const effectivelyLocked = isLocked || lockExpired;

  // Which timer is active and how urgent is it
  const activeTimeLeft = effectivelyLocked ? closeTimeLeft : lockTimeLeft;
  const isUrgent = activeTimeLeft > 0 && activeTimeLeft <= 30;

  // Smooth urgency color: violet → amber (60s) → pink (30s) → pulse (<15s)
  const urgencyColor = useMemo(() => {
    if (isSettled || activeTimeLeft <= 0) return undefined;
    if (activeTimeLeft > 60) return undefined; // no urgency
    if (activeTimeLeft > 30) {
      // 60→30s: violet → amber
      const t = 1 - (activeTimeLeft - 30) / 30;
      return lerpColor(COLOR_VIOLET, COLOR_AMBER, t);
    }
    // 30→0s: amber → pink
    const t = 1 - activeTimeLeft / 30;
    return lerpColor(COLOR_AMBER, COLOR_PINK, t);
  }, [isSettled, activeTimeLeft]);

  let label: string;
  let timer: string;
  let sublabel: string;
  let chipClass = "bg-base-200/70 text-pg-muted border-pg-border/60";
  let timerClass = "text-base-content";
  let sublabelClass = "text-pg-muted/50";
  let dotClass = "bg-pg-violet";
  let dotAnimated = false;
  let showAwaitingSettlementTooltip = false;
  let showCancellationTooltip = false;
  const awaitingSettlementTooltip = "Awaiting settlement";

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
      sublabel = "";
      chipClass = "bg-pg-pink/15 text-pg-pink border-pg-pink/35";
      sublabelClass = "text-pg-pink/75";
    } else if (outcome === "refund" || isCancelled) {
      label = "Round cancelled";
      timer = "";
      sublabel = canClaim ? "Refund available" : "Settlement complete";
      chipClass = "bg-pg-amber/15 text-pg-amber border-pg-amber/35";
      sublabelClass = canClaim ? "font-bold text-pg-amber" : "text-pg-amber/75";
      if (cancellationReason) showCancellationTooltip = true;
    } else {
      label = "Round settled";
      timer = "";
      sublabel = canClaim ? "Claim available" : "Settlement complete";
      chipClass = "bg-pg-violet/14 text-pg-violet border-pg-violet/30";
      sublabelClass = "text-pg-violet/75";
    }
  } else if (!effectivelyLocked && hasBet) {
    label = "Bets locked";
    timer = lockFormatted;
    sublabel = "";
    chipClass = "bg-pg-amber/14 text-pg-amber border-pg-amber/25";
    timerClass = "text-pg-amber";
    sublabelClass = "text-pg-muted/55";
    dotClass = "bg-pg-amber";
    dotAnimated = false;
  } else if (!effectivelyLocked) {
    label = "Betting closes in";
    timer = lockFormatted;
    sublabel = "Place your bets";
    chipClass = "bg-pg-violet/12 text-pg-violet border-pg-violet/25";
    timerClass = isUrgent ? "motion-safe:animate-pulse" : "text-base-content";
    sublabelClass = "text-pg-muted/55";
    dotClass = "bg-pg-violet";
    dotAnimated = true;
  } else if (!closeExpired) {
    label = isLocked ? "Round ends in" : "Bets locked";
    timer = closeFormatted;
    sublabel = isLocked ? "Bets locked" : "";
    chipClass = "bg-pg-amber/14 text-pg-amber border-pg-amber/25";
    timerClass = "text-pg-amber";
    sublabelClass = "text-pg-muted/60";
    dotClass = "bg-pg-amber";
    dotAnimated = true;
  } else {
    label = "Bets locked";
    timer = "";
    sublabel = "";
    chipClass = "bg-pg-amber/14 text-pg-amber border-pg-amber/25";
    dotClass = "bg-pg-amber";
    showAwaitingSettlementTooltip = true;
  }

  return (
    <div className="mx-auto w-full max-w-[260px] py-1 text-center transition-all duration-300">
      <div
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider transition-colors duration-500 ${chipClass}`}
      >
        {!isSettled && (
          <span
            className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${dotClass} ${dotAnimated ? "motion-safe:animate-pulse" : ""}`}
            aria-hidden="true"
            style={urgencyColor ? { backgroundColor: urgencyColor } : undefined}
          />
        )}
        <span>{isSettled ? label.toUpperCase() : label}</span>
        {showAwaitingSettlementTooltip && (
          <InfoTooltip text={awaitingSettlementTooltip} iconClassName="h-3 w-3 text-pg-amber/80" />
        )}
        {showCancellationTooltip && cancellationReason && (
          <InfoTooltip text={cancellationReason} iconClassName="h-3 w-3 text-pg-amber/80" />
        )}
      </div>

      {timer ? (
        <div
          className={`mt-2 text-3xl font-mono font-bold tabular-nums transition-colors duration-500 ${timerClass}`}
          style={urgencyColor ? { color: urgencyColor } : undefined}
        >
          {timer}
        </div>
      ) : null}
      {sublabel ? (
        <div className={`mt-1 text-[11px] transition-colors duration-300 ${sublabelClass}`}>{sublabel}</div>
      ) : null}
    </div>
  );
}
