import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract, useSelectedNetwork } from "~~/hooks/scaffold-eth";

const ORACLE_PAGE_SIZE = 500;
const ORACLE_MAX_PAGES = 200;

/** Fetch active tokens from a single Oracle, handling pagination & fallback. */
async function fetchActiveTokens(
  publicClient: any,
  oracleAddress: `0x${string}`,
  oracleAbi: readonly any[],
): Promise<string[]> {
  try {
    const all: string[] = [];
    let offset = 0n;

    for (let i = 0; i < ORACLE_MAX_PAGES; i++) {
      const page = (await publicClient.readContract({
        address: oracleAddress,
        abi: oracleAbi,
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
      address: oracleAddress,
      abi: oracleAbi,
      functionName: "getActiveTokens",
    } as any)) as string[];
    return all || [];
  }
}

/**
 * Hook to read all active markets from both V1 and V2 Oracle registries.
 * Returns a Set of token addresses that have live prediction markets.
 */
export function useEligibleTokens() {
  const selectedNetwork = useSelectedNetwork();
  const publicClient = usePublicClient({ chainId: selectedNetwork.id });

  // V1 Oracle
  const { data: oracleV1, isLoading: isV1Loading } = useDeployedContractInfo({
    contractName: "BankrBetsOracle",
  });

  // V2 Oracle
  const { data: oracleV2, isLoading: isV2Loading } = useDeployedContractInfo({
    contractName: "BankrBetsOracleV2",
  });

  const { data: activeTokens = [], isLoading: isTokensLoading } = useQuery({
    queryKey: ["oracle-active-tokens-merged", selectedNetwork.id, oracleV1?.address, oracleV2?.address],
    enabled: !!publicClient && !!oracleV1?.address,
    refetchInterval: 15000,
    queryFn: async (): Promise<string[]> => {
      if (!publicClient || !oracleV1) return [];

      const promises: Promise<string[]>[] = [fetchActiveTokens(publicClient, oracleV1.address, oracleV1.abi)];

      if (oracleV2) {
        promises.push(fetchActiveTokens(publicClient, oracleV2.address, oracleV2.abi));
      }

      const results = await Promise.all(promises);
      // Deduplicate
      return [...new Set(results.flat())];
    },
  });

  const { data: tokenCount } = useScaffoldReadContract({
    contractName: "BankrBetsOracle",
    functionName: "getTokenCount",
  });

  // V2 token count (may be undefined if V2 not deployed)
  const { data: tokenCountV2 } = useScaffoldReadContract({
    contractName: "BankrBetsOracleV2",
    functionName: "getTokenCount",
  });

  const eligibleSet = new Set<string>((activeTokens || []).map((addr: string) => addr.toLowerCase()));

  return {
    eligibleTokens: activeTokens,
    eligibleSet,
    tokenCount: (tokenCount ? Number(tokenCount) : 0) + (tokenCountV2 ? Number(tokenCountV2) : 0),
    isLoading: isV1Loading || isV2Loading || isTokensLoading,
  };
}
