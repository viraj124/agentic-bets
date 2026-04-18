import { CdpEvmWalletProvider } from "@coinbase/agentkit";
import { encodeFunctionData, formatUnits, parseUnits, type Hex } from "viem";
import {
  USDC_ADDRESS,
  USDC_DECIMALS,
  erc20Abi,
  getPredictionAddress,
  predictionAbi,
} from "./contracts.js";

let walletProvider: CdpEvmWalletProvider | null = null;

export async function getWalletProvider(): Promise<CdpEvmWalletProvider> {
  if (walletProvider) return walletProvider;

  const rpcUrl = process.env.RPC_URL || "https://mainnet.base.org";

  walletProvider = await CdpEvmWalletProvider.configureWithWallet({
    apiKeyId: process.env.CDP_API_KEY_ID!,
    apiKeySecret: process.env.CDP_API_KEY_SECRET!,
    walletSecret: process.env.CDP_WALLET_SECRET!,
    rpcUrl,
    networkId: process.env.NETWORK_ID || "base-mainnet",
  });

  return walletProvider;
}

export async function getWalletAddress(): Promise<string> {
  const wp = await getWalletProvider();
  return wp.getAddress();
}

export async function getUsdcBalance(): Promise<string> {
  const wp = await getWalletProvider();
  const address = wp.getAddress() as Hex;

  const result = await wp.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });

  return formatUnits(result as bigint, USDC_DECIMALS);
}

export async function placeBet(
  tokenAddress: string,
  amountUsdc: string,
  direction: "up" | "down",
): Promise<string> {
  const wp = await getWalletProvider();
  const predictionAddress = getPredictionAddress(tokenAddress);
  const amount = parseUnits(amountUsdc, USDC_DECIMALS);
  const position = direction === "up" ? 0 : 1;

  // Check + set USDC allowance
  const walletAddr = wp.getAddress() as Hex;
  const currentAllowance = (await wp.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [walletAddr, predictionAddress],
  })) as bigint;

  if (currentAllowance < amount) {
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [predictionAddress, amount],
    });
    const approveHash = await wp.sendTransaction({
      to: USDC_ADDRESS,
      data: approveData,
    });
    await wp.waitForTransactionReceipt(approveHash);
  }

  // Place bet
  const betData = encodeFunctionData({
    abi: predictionAbi,
    functionName: "bet",
    args: [tokenAddress as Hex, amount, position],
  });
  const hash = await wp.sendTransaction({
    to: predictionAddress,
    data: betData,
  });
  await wp.waitForTransactionReceipt(hash);

  return hash;
}

export async function claimWinnings(
  tokenAddress: string,
  epochs: number[],
): Promise<string> {
  const wp = await getWalletProvider();
  const predictionAddress = getPredictionAddress(tokenAddress);

  const data = encodeFunctionData({
    abi: predictionAbi,
    functionName: "claim",
    args: [tokenAddress as Hex, epochs.map(BigInt)],
  });

  const hash = await wp.sendTransaction({
    to: predictionAddress,
    data,
  });
  await wp.waitForTransactionReceipt(hash);

  return hash;
}

export async function checkClaimable(
  tokenAddress: string,
  epoch: number,
): Promise<boolean> {
  const wp = await getWalletProvider();
  const predictionAddress = getPredictionAddress(tokenAddress);
  const walletAddr = wp.getAddress() as Hex;

  const result = await wp.readContract({
    address: predictionAddress,
    abi: predictionAbi,
    functionName: "claimable",
    args: [tokenAddress as Hex, BigInt(epoch), walletAddr],
  });

  return result as boolean;
}
