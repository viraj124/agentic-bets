"use client";

import { useCountdown } from "~~/hooks/bankrbets/useCountdown";

interface RoundTimerProps {
  lockTimestamp: number;
  closeTimestamp: number;
  isLocked: boolean;
}

export function RoundTimer({ lockTimestamp, closeTimestamp, isLocked }: RoundTimerProps) {
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

  if (!effectivelyLocked) {
    label = "Betting closes in";
    timer = lockFormatted;
    sublabel = "Place your bets";
  } else if (!closeExpired) {
    label = isLocked ? "Round ends in" : "Bets locked · grace period";
    timer = closeFormatted;
    sublabel = isLocked ? "Bets locked" : "Waiting for settlement";
  } else {
    label = "Settling";
    timer = "--:--";
    sublabel = "Awaiting settlement";
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-bold text-pg-muted uppercase tracking-wider">{label}</span>
      <div
        className={`text-3xl font-mono font-bold tabular-nums transition-colors ${
          closeExpired
            ? "text-base-content/30"
            : isUrgent
              ? "text-pg-pink animate-pulse"
              : effectivelyLocked
                ? "text-pg-amber"
                : "text-base-content"
        }`}
      >
        {timer}
      </div>
      <span className="text-[11px] text-pg-muted/50">{sublabel}</span>
    </div>
  );
}
