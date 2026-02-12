"use client";

import { IdentityBadge } from "~~/components/bankrbets/IdentityBadge";
import { useResolvedAddresses } from "~~/hooks/bankrbets/useResolvedAddresses";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

interface MarketCreatorBadgeProps {
  tokenAddress: string;
}

export function MarketCreatorBadge({ tokenAddress }: MarketCreatorBadgeProps) {
  const { data: creator } = useScaffoldReadContract({
    contractName: "BankrBetsOracle",
    functionName: "getMarketCreator",
    args: [tokenAddress],
  });

  const validCreator = creator && creator !== ZERO_ADDR ? creator : undefined;
  const { data: resolvedMap } = useResolvedAddresses(validCreator ? [validCreator] : undefined);

  if (!validCreator) return null;

  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-base-content/40">
      <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
      Created by{" "}
      <IdentityBadge address={validCreator} resolved={resolvedMap.get(validCreator.toLowerCase())} size="sm" />
      <span className="text-primary/50">earns 0.5%</span>
    </div>
  );
}
