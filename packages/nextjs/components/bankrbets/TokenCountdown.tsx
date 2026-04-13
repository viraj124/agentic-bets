"use client";

import { useMemo } from "react";
import { useCountdown } from "~~/hooks/bankrbets/useCountdown";
import { useCurrentRound } from "~~/hooks/bankrbets/usePredictionContract";

interface TokenCountdownProps {
  tokenAddress: string;
}

/**
 * Compact countdown pill for TokenCard rows.
 * Only renders when the token has an active open round approaching lock.
 */
export function TokenCountdown({ tokenAddress }: TokenCountdownProps) {
  const { round, isActive } = useCurrentRound(tokenAddress);

  const lockTimestamp = round ? Number(round.lockTimestamp) : 0;
  const isLocked = !!(round && (round.locked || round.oracleCalled || round.cancelled));

  const { timeLeft, formatted, isExpired } = useCountdown(lockTimestamp);

  const urgency = useMemo(() => {
    if (timeLeft <= 0) return "none";
    if (timeLeft <= 30) return "critical";
    if (timeLeft <= 60) return "warning";
    return "normal";
  }, [timeLeft]);

  // Don't render if: no active round, round is locked/settled, or timer expired
  if (!isActive || !round || isLocked || isExpired) return null;

  const styles = {
    normal: {
      bg: "rgba(139,92,246,0.12)",
      border: "1px solid rgba(139,92,246,0.3)",
      color: "#8B5CF6",
    },
    warning: {
      bg: "rgba(251,191,36,0.12)",
      border: "1px solid rgba(251,191,36,0.3)",
      color: "#FBBF24",
    },
    critical: {
      bg: "rgba(244,114,182,0.15)",
      border: "1px solid rgba(244,114,182,0.35)",
      color: "#F472B6",
    },
    none: { bg: "transparent", border: "none", color: "transparent" },
  };

  const s = styles[urgency];

  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full tabular-nums ${urgency === "critical" ? "motion-safe:animate-pulse" : ""}`}
      style={{
        background: s.bg,
        border: s.border,
        color: s.color,
      }}
    >
      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
      </svg>
      {formatted}
    </span>
  );
}
