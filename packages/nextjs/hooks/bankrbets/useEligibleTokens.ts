import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

/**
 * Hook to read all active markets from the Oracle registry
 * Returns a Set of token addresses that have live prediction markets
 */
export function useEligibleTokens() {
  const { data: activeTokens, isLoading } = useScaffoldReadContract({
    contractName: "BankrBetsOracle",
    functionName: "getActiveTokens",
    query: {
      refetchInterval: 15000,
    },
  });

  const { data: tokenCount } = useScaffoldReadContract({
    contractName: "BankrBetsOracle",
    functionName: "getTokenCount",
  });

  const eligibleSet = new Set<string>((activeTokens || []).map((addr: string) => addr.toLowerCase()));

  return {
    eligibleTokens: activeTokens || [],
    eligibleSet,
    tokenCount: tokenCount ? Number(tokenCount) : 0,
    isLoading,
  };
}
