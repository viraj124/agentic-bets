"use client";

import { useCountdown } from "~~/hooks/bankrbets/useCountdown";

interface RoundTimerProps {
  lockTimestamp: number;
  closeTimestamp: number;
  isLocked: boolean;
}

export function RoundTimer({ lockTimestamp, closeTimestamp, isLocked }: RoundTimerProps) {
  const targetTimestamp = isLocked ? closeTimestamp : lockTimestamp;
  const { formatted, isExpired, timeLeft } = useCountdown(targetTimestamp);

  const label = isLocked ? "Round ends in" : "Betting closes in";
  const isUrgent = timeLeft <= 30;

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs font-medium text-base-content/50 uppercase tracking-wider">{label}</span>
      <div
        className={`text-3xl font-mono font-bold tabular-nums ${
          isExpired ? "text-base-content/30" : isUrgent ? "text-red-500 animate-pulse" : "text-base-content"
        }`}
      >
        {isExpired ? "--:--" : formatted}
      </div>
      {!isExpired && (
        <span className="text-[11px] text-base-content/40">{isLocked ? "Bets locked" : "Place your bets"}</span>
      )}
    </div>
  );
}
