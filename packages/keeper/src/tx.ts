import { type Address, BaseError, ContractFunctionRevertedError } from "viem";
import { predictionAbi, erc20Abi } from "./abis.js";
import { PREDICTION_ADDRESS, USDC_ADDRESS, GAS_LIMIT, TX_TIMEOUT_MS } from "./config.js";
import { logger } from "./logger.js";

// Reverts that mean someone else already settled — not an error
const EXPECTED_REVERTS = [
  "RoundAlreadyLocked",
  "RoundAlreadyClosed",
  "RoundNotLockable",
  "LockWindowExpired",
  "RoundNotClosable",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Clients = { wallet: any; public: any };

export type TxResult = { status: "sent"; hash: string } | { status: "already_settled" } | { status: "error"; reason: string };

export async function submitLockRound(clients: Clients, token: Address): Promise<TxResult> {
  return submitTx(clients, "lockRound", token);
}

export async function submitCloseRound(clients: Clients, token: Address): Promise<TxResult> {
  return submitTx(clients, "closeRound", token);
}

export async function sweepUsdc(clients: Clients, recipient: Address, amount: bigint): Promise<TxResult> {
  try {
    logger.info("Sweeping USDC", { recipient, amount: amount.toString() });
    const hash = await clients.wallet.writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "transfer",
      args: [recipient, amount],
      gas: GAS_LIMIT,
    });

    await waitForTx(clients.public, hash);
    logger.info("USDC swept", { hash, amount: amount.toString() });
    return { status: "sent", hash };
  } catch (err) {
    const reason = extractErrorReason(err);
    logger.error("USDC sweep failed", { reason });
    return { status: "error", reason };
  }
}

async function submitTx(
  clients: Clients,
  fn: "lockRound" | "closeRound",
  token: Address,
): Promise<TxResult> {
  try {
    const hash = await clients.wallet.writeContract({
      address: PREDICTION_ADDRESS,
      abi: predictionAbi,
      functionName: fn,
      args: [token],
      gas: GAS_LIMIT,
    });

    logger.info(`${fn} tx sent`, { token, hash });
    await waitForTx(clients.public, hash);
    logger.info(`${fn} confirmed`, { token, hash });
    return { status: "sent", hash };
  } catch (err) {
    const reason = extractErrorReason(err);
    if (isExpectedRevert(reason)) {
      logger.info(`${fn} already settled`, { token, reason });
      return { status: "already_settled" };
    }
    logger.error(`${fn} failed`, { token, reason });
    return { status: "error", reason };
  }
}

async function waitForTx(publicClient: Clients["public"], hash: `0x${string}`): Promise<void> {
  await publicClient.waitForTransactionReceipt({
    hash,
    timeout: TX_TIMEOUT_MS,
  });
}

function isExpectedRevert(reason: string): boolean {
  return EXPECTED_REVERTS.some(r => reason.includes(r));
}

function extractErrorReason(err: unknown): string {
  if (err instanceof BaseError) {
    const revertError = err.walk(e => e instanceof ContractFunctionRevertedError);
    if (revertError instanceof ContractFunctionRevertedError) {
      return revertError.data?.errorName ?? revertError.shortMessage;
    }
    return err.shortMessage;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
