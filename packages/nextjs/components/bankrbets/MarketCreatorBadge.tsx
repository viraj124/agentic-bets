"use client";

import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

interface MarketCreatorBadgeProps {
  tokenAddress: string;
}

export function MarketCreatorBadge({ tokenAddress }: MarketCreatorBadgeProps) {
  const { data: creator } = useScaffoldReadContract({
    contractName: "BankrBetsOracle",
    functionName: "getMarketCreator",
    args: [tokenAddress],
  });

  if (!creator || creator === "0x0000000000000000000000000000000000000000") return null;

  const short = `${creator.slice(0, 6)}...${creator.slice(-4)}`;

  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-base-content/40">
      <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
      Created by{" "}
      <a
        href={`https://basescan.org/address/${creator}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-primary/70 hover:text-primary transition-colors"
      >
        {short}
      </a>
      <span className="text-primary/50">earns 0.5%</span>
    </div>
  );
}
