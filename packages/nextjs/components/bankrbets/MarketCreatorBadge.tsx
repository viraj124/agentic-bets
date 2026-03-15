"use client";

import { IdentityBadge } from "~~/components/bankrbets/IdentityBadge";
import { InfoTooltip } from "~~/components/bankrbets/InfoTooltip";
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
        <InfoTooltip text={creatorFeeHint} iconClassName="w-3 h-3 text-primary/60" />
      </span>
    </div>
  );
}
