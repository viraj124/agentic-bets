import { useQuery } from "@tanstack/react-query";
import type { EnrichedToken, PoolKeyData } from "~~/app/api/bankr-tokens/route";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

// WETH on Base
const WETH_BASE = "0x4200000000000000000000000000000000000006";

// Fallback: Clanker StaticFeeV2 hook (most common for Bankr tokens)
const FALLBACK_HOOK = "0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC" as `0x${string}`;
const DYNAMIC_FEE_FLAG = 0x800000;
const DEFAULT_TICK_SPACING = 200;

/** Derive a fallback PoolKey when the API doesn't have pool metadata for this token */
function deriveFallbackPoolKey(tokenAddress: string): PoolKeyData {
  const token = tokenAddress.toLowerCase();
  const weth = WETH_BASE.toLowerCase();
  const [currency0, currency1] = token < weth ? [tokenAddress, WETH_BASE] : [WETH_BASE, tokenAddress];

  return {
    currency0,
    currency1,
    fee: DYNAMIC_FEE_FLAG,
    tickSpacing: DEFAULT_TICK_SPACING,
    hooks: FALLBACK_HOOK,
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

  const createMarket = async (tokenAddress: string, poolAddress: string) => {
    const addr = tokenAddress.toLowerCase();
    const poolKey = tokenPoolMap?.get(addr) ?? deriveFallbackPoolKey(tokenAddress);

    return writeContractAsync({
      functionName: "createAndStartRound",
      args: [tokenAddress, poolAddress, poolKey],
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
