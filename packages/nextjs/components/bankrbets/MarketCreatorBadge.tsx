"use client";

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
    <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-base-content/40">
      <span className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
      <span>Created by</span>
      <a
        href={`https://basescan.org/address/${validCreator}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold font-mono text-base-content hover:text-pg-violet transition-colors truncate"
      >
        {resolvedMap.get(validCreator.toLowerCase())?.baseName ||
          resolvedMap.get(validCreator.toLowerCase())?.ensName ||
          `${validCreator.slice(0, 6)}...${validCreator.slice(-4)}`}
      </a>
      <span className="text-primary/50">&middot;</span>
      <span className="inline-flex items-center gap-1 text-primary/50">
        <span>earns 0.5%</span>
        <InfoTooltip text={creatorFeeHint} iconClassName="w-3 h-3 text-primary/60" />
      </span>
    </div>
  );
}
