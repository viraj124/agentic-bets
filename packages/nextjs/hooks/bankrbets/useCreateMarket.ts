import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

// WETH on Base
const WETH_BASE = "0x4200000000000000000000000000000000000006";

/**
 * Derive a standard Uniswap V4 PoolKey for a token paired with WETH
 * Currencies must be sorted by address (lower first)
 */
function derivePoolKey(tokenAddress: string) {
  const token = tokenAddress.toLowerCase();
  const weth = WETH_BASE.toLowerCase();

  const [currency0, currency1] = token < weth ? [tokenAddress, WETH_BASE] : [WETH_BASE, tokenAddress];

  return {
    currency0,
    currency1,
    fee: 3000, // 0.3% standard fee
    tickSpacing: 60, // Standard for 3000 fee tier
    hooks: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  };
}

/**
 * Hook to create a new prediction market via createAndStartRound
 */
export function useCreateMarket() {
  const { writeContractAsync, isPending } = useScaffoldWriteContract("BankrBetsPrediction");

  const createMarket = async (tokenAddress: string, poolAddress: string) => {
    const poolKey = derivePoolKey(tokenAddress);
    return writeContractAsync({
      functionName: "createAndStartRound",
      args: [tokenAddress, poolAddress, poolKey],
    });
  };

  return {
    createMarket,
    isCreating: isPending,
  };
}
