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

/** Fetch all active markets from a single Oracle, handling pagination & fallback. */
async function fetchOracleMarkets(
  publicClient: any,
  oracleAddress: `0x${string}`,
  oracleAbi: readonly any[],
): Promise<OracleMarketView[]> {
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
}

/**
 * Hook to read all active Bankr markets from both V1 and V2 Oracle registries
 * and enrich with GeckoTerminal price data.
 */
export function useMarketTokens() {
  const selectedNetwork = useSelectedNetwork();
  const publicClient = usePublicClient({ chainId: selectedNetwork.id });

  // V1 Oracle
  const { data: oracleV1, isLoading: isV1Loading } = useDeployedContractInfo({
    contractName: "BankrBetsOracle",
  });
  const configuredV1 = contracts?.[selectedNetwork.id]?.BankrBetsOracle as
    | { address: `0x${string}`; abi: readonly any[] }
    | undefined;
  const v1Address = oracleV1?.address || configuredV1?.address;
  const v1Abi = oracleV1?.abi || configuredV1?.abi;

  // V2 Oracle
  const { data: oracleV2, isLoading: isV2Loading } = useDeployedContractInfo({
    contractName: "BankrBetsOracleV2",
  });
  const configuredV2 = contracts?.[selectedNetwork.id]?.BankrBetsOracleV2 as
    | { address: `0x${string}`; abi: readonly any[] }
    | undefined;
  const v2Address = oracleV2?.address || configuredV2?.address;
  const v2Abi = oracleV2?.abi || configuredV2?.abi;

  const v2Ready = !!v2Address && !!v2Abi;

  const { data: markets = [], isLoading: isMarketsLoading } = useQuery({
    queryKey: ["oracle-active-markets-merged", selectedNetwork.id, v1Address, v2Address],
    enabled: !!publicClient && !!v1Address && !!v1Abi,
    staleTime: 10_000,
    gcTime: 30 * 60_000,
    placeholderData: previousData => previousData,
    refetchInterval: 15000,
    queryFn: async (): Promise<OracleMarketView[]> => {
      if (!publicClient || !v1Address || !v1Abi) return [];

      const promises: Promise<OracleMarketView[]>[] = [fetchOracleMarkets(publicClient, v1Address, v1Abi)];

      if (v2Ready) {
        promises.push(fetchOracleMarkets(publicClient, v2Address!, v2Abi!));
      }

      const results = await Promise.all(promises);
      const merged = results.flat();

      // Deduplicate by token address (V2 takes precedence if same token in both)
      const seen = new Map<string, OracleMarketView>();
      for (const m of merged) {
        seen.set(m.token.toLowerCase(), m);
      }
      return Array.from(seen.values());
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
    isLoading: (isV1Loading || isV2Loading) && isMarketsLoading,
    marketCount: markets.length,
  };
}
