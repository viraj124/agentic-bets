import { useQuery } from "@tanstack/react-query";
import type { EnrichedToken, PoolKeyData } from "~~/app/api/bankr-tokens/route";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { getPredictionContractName } from "~~/lib/contractResolver";

/**
 * Hook to create a new prediction market via createAndStartRound.
 * Uses pool keys resolved from the Clanker API when available,
 * falls back to Clanker V4.1 dynamic fee parameters for new tokens.
 *
 * @param tokenAddress - optional; when provided, routes writes to the correct
 *   contract (V2 for AGBETS, V1 for everything else). Defaults to V1.
 */
export function useCreateMarket(tokenAddress?: string) {
  const contractName = getPredictionContractName(tokenAddress ?? "");
  const { writeContractAsync, isPending } = useScaffoldWriteContract(contractName);

  // Fetch resolved pool keys from the API — only include tokens with verified
  // pool keys (i.e. the key was resolved against a known Bankr/Clanker hook).
  // Tokens with unverified keys (e.g. WCHAN) use unsupported hooks and will
  // revert with PoolNotInitialized on-chain.
  const { data: tokenPoolMap } = useQuery({
    queryKey: ["bankr-pool-keys"],
    queryFn: async (): Promise<Map<string, PoolKeyData>> => {
      const res = await fetch("/api/bankr-tokens");
      if (!res.ok) return new Map();
      const json = (await res.json()) as { tokens?: EnrichedToken[] };
      const map = new Map<string, PoolKeyData>();
      for (const t of json.tokens || []) {
        if (t.poolKeyVerified !== false) {
          map.set(t.address.toLowerCase(), t.poolKey);
        }
      }
      return map;
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const createMarket = async (tokenAddress: string) => {
    const addr = tokenAddress.toLowerCase();
    const poolKey = tokenPoolMap?.get(addr);
    if (!poolKey) {
      throw new Error(
        "This token's pool uses an unsupported hook. Only Bankr/Clanker V4 pools can have prediction markets.",
      );
    }

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
