import { useCallback, useMemo } from "react";
import { erc20Abi, maxUint256 } from "viem";
import { base } from "viem/chains";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";

// USDC addresses by chain
const USDC_ADDRESS: Record<number, `0x${string}`> = {
  8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet
  84532: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Base Sepolia
};

/**
 * Hook to manage USDC approval for the BankrBetsPrediction contract.
 * Returns current allowance, whether approval is needed, and an approve function.
 */
export function useUsdcApproval(requiredAmount: bigint) {
  const { address, chainId } = useAccount();
  const { data: predictionContract } = useDeployedContractInfo("BankrBetsPrediction");

  const spenderAddress = predictionContract?.address;

  // Get USDC address for current chain, fallback to Base mainnet
  const usdcAddress = useMemo(() => {
    if (!chainId) return USDC_ADDRESS[base.id];
    return USDC_ADDRESS[chainId] || USDC_ADDRESS[base.id];
  }, [chainId]);

  // Read current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address!, spenderAddress!],
    query: {
      enabled: !!address && !!spenderAddress,
      refetchInterval: 10000,
    },
  });

  // Read USDC balance
  const { data: balance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address!],
    query: {
      enabled: !!address,
      refetchInterval: 10000,
    },
  });

  const needsApproval = useMemo(() => {
    if (!allowance || !requiredAmount) return false;
    return allowance < requiredAmount;
  }, [allowance, requiredAmount]);

  const hasBalance = useMemo(() => {
    if (!balance || !requiredAmount) return true; // assume true if unknown
    return balance >= requiredAmount;
  }, [balance, requiredAmount]);

  // Approve max USDC
  const { writeContractAsync, isPending: isApproving } = useWriteContract();

  const approve = useCallback(async () => {
    if (!spenderAddress || !usdcAddress) return;

    const hash = await writeContractAsync({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: "approve",
      args: [spenderAddress, maxUint256],
    });

    // Wait briefly then refetch allowance
    await new Promise(resolve => setTimeout(resolve, 2000));
    await refetchAllowance();

    return hash;
  }, [spenderAddress, usdcAddress, writeContractAsync, refetchAllowance]);

  return {
    allowance: allowance ?? 0n,
    balance: balance ?? 0n,
    needsApproval,
    hasBalance,
    approve,
    isApproving,
    usdcAddress,
  };
}
