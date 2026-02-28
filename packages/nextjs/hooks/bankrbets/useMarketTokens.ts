import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { PoolData, useGeckoTerminalMulti } from "~~/hooks/bankrbets/useGeckoTerminal";
import { useDeployedContractInfo, useSelectedNetwork } from "~~/hooks/scaffold-eth";
import { contracts } from "~~/utils/scaffold-eth/contract";

const ORACLE_PAGE_SIZE = 200;
const ORACLE_MAX_PAGES = 200;

type OracleMarketView = {
  token: string;
  creator: string;
  poolAddress: string;
  createdAt: bigint;
};

export interface MarketToken {
  token: string;
  creator: string;
  poolAddress: string;
  createdAt: number;
  // From GeckoTerminal
  name: string;
  symbol: string;
  poolData?: PoolData;
}

/**
 * Hook to read all active Bankr markets from the Oracle registry
 * and enrich with GeckoTerminal price data.
 * This replaces useClankerTokens — only on-chain registered markets are shown.
 */
export function useMarketTokens() {
  const selectedNetwork = useSelectedNetwork();
  const publicClient = usePublicClient({ chainId: selectedNetwork.id });
  const { data: oracleContract, isLoading: isContractLoading } = useDeployedContractInfo({
    contractName: "BankrBetsOracle",
  });
  const configuredOracleContract = contracts?.[selectedNetwork.id]?.BankrBetsOracle as
    | { address: `0x${string}`; abi: any[] }
    | undefined;

  // Use the static deployed config immediately on mount, while still allowing
  // deployed contract hook data to take precedence when available.
  const oracleAddress = oracleContract?.address || configuredOracleContract?.address;
  const oracleAbi = oracleContract?.abi || configuredOracleContract?.abi;

  const { data: markets = [], isLoading: isMarketsLoading } = useQuery({
    queryKey: ["oracle-active-markets-paged", selectedNetwork.id, oracleAddress],
    enabled: !!publicClient && !!oracleAddress && !!oracleAbi,
    staleTime: 10_000,
    gcTime: 30 * 60_000,
    placeholderData: previousData => previousData,
    refetchInterval: 15000,
    queryFn: async (): Promise<OracleMarketView[]> => {
      if (!publicClient || !oracleAddress || !oracleAbi) return [];

      try {
        const all: OracleMarketView[] = [];
        let offset = 0n;

        for (let i = 0; i < ORACLE_MAX_PAGES; i++) {
          const page = (await publicClient.readContract({
            address: oracleAddress,
            abi: oracleAbi,
            functionName: "getActiveMarketsInfoPage",
            args: [offset, BigInt(ORACLE_PAGE_SIZE)],
          } as any)) as OracleMarketView[];

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
          functionName: "getActiveMarketsInfo",
        } as any)) as OracleMarketView[];
        return all || [];
      }
    },
  });

  const poolAddresses = Array.from(new Set(markets.map(m => m.poolAddress).filter(Boolean)));
  const { data: poolsData } = useGeckoTerminalMulti(poolAddresses);

  // Build pool data lookup
  const poolMap = new Map<string, PoolData>();
  if (poolsData) {
    poolsData.forEach(p => poolMap.set(p.poolAddress.toLowerCase(), p));
  }

  // Merge on-chain market info with GeckoTerminal data
  const tokens: MarketToken[] = markets.map(m => {
    const pd = poolMap.get(m.poolAddress.toLowerCase());
    // Extract symbol from pool name (e.g. "TOKEN / WETH" → "TOKEN")
    const nameFromPool = pd?.tokenName || "";
    const symbol = nameFromPool.split("/")[0]?.trim() || `${m.token.slice(0, 6)}...${m.token.slice(-4)}`;
    return {
      token: m.token,
      creator: m.creator,
      poolAddress: m.poolAddress,
      createdAt: Number(m.createdAt),
      name: nameFromPool,
      symbol,
      poolData: pd,
    };
  });

  return {
    tokens,
    isLoading: isContractLoading && isMarketsLoading,
    marketCount: markets.length,
  };
}
