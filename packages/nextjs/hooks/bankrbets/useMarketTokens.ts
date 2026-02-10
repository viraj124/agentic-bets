import { PoolData, useGeckoTerminalMulti } from "~~/hooks/bankrbets/useGeckoTerminal";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

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
  const { data: marketsInfo, isLoading } = useScaffoldReadContract({
    contractName: "BankrBetsOracle",
    functionName: "getActiveMarketsInfo",
    query: {
      refetchInterval: 15000,
    },
  });

  const markets = (marketsInfo || []) as readonly {
    token: string;
    creator: string;
    poolAddress: string;
    createdAt: bigint;
  }[];

  const poolAddresses = markets.map(m => m.poolAddress).filter(Boolean);
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
    isLoading,
    marketCount: markets.length,
  };
}
