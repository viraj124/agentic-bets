import { useQuery } from "@tanstack/react-query";
import type { EnrichedToken, PoolKeyData } from "~~/app/api/bankr-tokens/route";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import {
  CLANKER_DYNAMIC_FEE_FLAG,
  DEFAULT_FALLBACK_HOOK,
  REQUIRED_TICK_SPACING,
  WETH_BASE,
} from "~~/lib/bankrPoolConstants";

/** Derive a fallback PoolKey when the API doesn't have pool metadata for this token */
function deriveFallbackPoolKey(tokenAddress: string): PoolKeyData {
  const token = tokenAddress.toLowerCase();
  const weth = WETH_BASE.toLowerCase();
  const [currency0, currency1] = token < weth ? [tokenAddress, WETH_BASE] : [WETH_BASE, tokenAddress];

  return {
    currency0,
    currency1,
    fee: CLANKER_DYNAMIC_FEE_FLAG,
    tickSpacing: REQUIRED_TICK_SPACING,
    hooks: DEFAULT_FALLBACK_HOOK,
  };
}

/**
 * Hook to create a new prediction market via createAndStartRound.
 * Uses pool keys resolved from the Clanker API when available,
 * falls back to Clanker V4.1 dynamic fee parameters for new tokens.
 */
export function useCreateMarket() {
  const { writeContractAsync, isPending } = useScaffoldWriteContract("BankrBetsPrediction");

  // Fetch resolved pool keys from the API
  const { data: tokenPoolMap } = useQuery({
    queryKey: ["bankr-pool-keys"],
    queryFn: async (): Promise<Map<string, PoolKeyData>> => {
      const res = await fetch("/api/bankr-tokens");
      if (!res.ok) return new Map();
      const json = (await res.json()) as { tokens?: EnrichedToken[] };
      const map = new Map<string, PoolKeyData>();
      for (const t of json.tokens || []) {
        map.set(t.address.toLowerCase(), t.poolKey);
      }
      return map;
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const createMarket = async (tokenAddress: string) => {
    const addr = tokenAddress.toLowerCase();
    const poolKey = tokenPoolMap?.get(addr) ?? deriveFallbackPoolKey(tokenAddress);

    return writeContractAsync({
      functionName: "createMarket",
      args: [tokenAddress, poolKey],
    });
  };

  /** Check if a token has a verified pool key from the API */
  const hasVerifiedPoolKey = (tokenAddress: string): boolean => {
    return tokenPoolMap?.has(tokenAddress.toLowerCase()) ?? false;
  };

  return {
    createMarket,
    isCreating: isPending,
    hasVerifiedPoolKey,
  };
}
