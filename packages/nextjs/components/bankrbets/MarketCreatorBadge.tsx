"use client";

import { IdentityBadge } from "~~/components/bankrbets/IdentityBadge";
import { useResolvedAddresses } from "~~/hooks/bankrbets/useResolvedAddresses";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

interface MarketCreatorBadgeProps {
  creatorAddress?: string;
}

export function MarketCreatorBadge({ creatorAddress }: MarketCreatorBadgeProps) {
  const validCreator = creatorAddress && creatorAddress !== ZERO_ADDR ? creatorAddress : undefined;
  const { data: resolvedMap } = useResolvedAddresses(validCreator ? [validCreator] : undefined);
  const creatorFeeHint = "Market creator earns 0.5% share of each settled betting round.";

  if (!validCreator) return null;

  return (
    <div className="inline-flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-base-content/40 flex-wrap">
      <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
      Created by{" "}
      <IdentityBadge address={validCreator} resolved={resolvedMap.get(validCreator.toLowerCase())} size="sm" />
      <span className="inline-flex items-center gap-1 text-primary/50">
        <span>earns 0.5%</span>
        <span
          className="tooltip tooltip-bottom tooltip-primary cursor-help"
          data-tip={creatorFeeHint}
          title={creatorFeeHint}
          aria-label={creatorFeeHint}
        >
          <svg
            className="w-3 h-3 text-primary/60"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.25 11.25h.008v.008h-.008v-.008ZM12 16.5v-4.5m0-9a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z"
            />
          </svg>
        </span>
      </span>
    </div>
  );
}
