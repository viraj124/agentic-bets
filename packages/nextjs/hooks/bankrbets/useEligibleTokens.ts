import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract, useSelectedNetwork } from "~~/hooks/scaffold-eth";

const ORACLE_PAGE_SIZE = 500;
const ORACLE_MAX_PAGES = 200;

/**
 * Hook to read all active markets from the Oracle registry
 * Returns a Set of token addresses that have live prediction markets
 */
export function useEligibleTokens() {
  const selectedNetwork = useSelectedNetwork();
  const publicClient = usePublicClient({ chainId: selectedNetwork.id });
  const { data: oracleContract, isLoading: isContractLoading } = useDeployedContractInfo({
    contractName: "BankrBetsOracle",
  });

  const { data: activeTokens = [], isLoading: isTokensLoading } = useQuery({
    queryKey: ["oracle-active-tokens-paged", selectedNetwork.id, oracleContract?.address],
    enabled: !!publicClient && !!oracleContract?.address,
    refetchInterval: 15000,
    queryFn: async (): Promise<string[]> => {
      if (!publicClient || !oracleContract) return [];

      try {
        const all: string[] = [];
        let offset = 0n;

        for (let i = 0; i < ORACLE_MAX_PAGES; i++) {
          const page = (await publicClient.readContract({
            address: oracleContract.address,
            abi: oracleContract.abi,
            functionName: "getActiveTokensPage",
            args: [offset, BigInt(ORACLE_PAGE_SIZE)],
          } as any)) as string[];

          if (!page || page.length === 0) break;
          all.push(...page);
          if (page.length < ORACLE_PAGE_SIZE) break;
          offset += BigInt(page.length);
        }

        return all;
      } catch {
        // Backward compatibility with older Oracle deployments.
        const all = (await publicClient.readContract({
          address: oracleContract.address,
          abi: oracleContract.abi,
          functionName: "getActiveTokens",
        } as any)) as string[];
        return all || [];
      }
    },
  });

  const { data: tokenCount } = useScaffoldReadContract({
    contractName: "BankrBetsOracle",
    functionName: "getTokenCount",
  });

  const eligibleSet = new Set<string>((activeTokens || []).map((addr: string) => addr.toLowerCase()));

  return {
    eligibleTokens: activeTokens,
    eligibleSet,
    tokenCount: tokenCount ? Number(tokenCount) : 0,
    isLoading: isContractLoading || isTokensLoading,
  };
}
