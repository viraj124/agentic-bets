import { useQuery } from "@tanstack/react-query";

const CLANKER_API_URL = "https://www.clanker.world/api/tokens";

export interface ClankerToken {
  id: number;
  name: string;
  symbol: string;
  contractAddress: string;
  poolAddress: string;
  pair: string;
  chainId: number;
  verified: boolean;
  startingMarketCap: number;
  imgUrl: string;
  deployedAt: string;
}

export function useClankerTokens(limit = 50) {
  return useQuery({
    queryKey: ["clanker-tokens", limit],
    queryFn: async (): Promise<ClankerToken[]> => {
      const res = await fetch(`${CLANKER_API_URL}?page=1`);
      if (!res.ok) throw new Error("Failed to fetch Clanker tokens");
      const json = await res.json();

      return (json.data || [])
        .filter((t: any) => t.chain_id === 8453 && t.verified && t.pool_address)
        .slice(0, limit)
        .map((t: any) => ({
          id: t.id,
          name: t.name,
          symbol: t.symbol,
          contractAddress: t.contract_address,
          poolAddress: t.pool_address,
          pair: t.pair || "WETH",
          chainId: t.chain_id,
          verified: t.verified,
          startingMarketCap: t.starting_market_cap || 0,
          imgUrl: t.img_url || "",
          deployedAt: t.deployed_at || t.created_at,
        }));
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
  });
}
