import { type Address } from "viem";
import { oracleAbi, predictionAbi, erc20Abi } from "./abis.js";
import {
  type Config,
  ORACLE_ADDRESS,
  PREDICTION_ADDRESS,
  USDC_ADDRESS,
  MARKET_REFRESH_TICKS,
} from "./config.js";
import { type HealthState } from "./health.js";
import { type Clients, submitLockRound, submitCloseRound, sweepUsdc } from "./tx.js";
import { logger } from "./logger.js";

export function startKeeper(
  clients: Clients,
  config: Config,
  health: HealthState,
): { stop: () => void } {
  let tick = 0;
  let activeTokens: Address[] = [];
  let running = true;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  async function poll() {
    if (!running) return;
    tick++;

    try {
      // Refresh active tokens every MARKET_REFRESH_TICKS ticks (~60s)
      if (tick === 1 || tick % MARKET_REFRESH_TICKS === 0) {
        activeTokens = await refreshActiveTokens(clients.public);
        health.activeMarkets = activeTokens.length;
        logger.info("Active markets refreshed", { count: activeTokens.length });
      }

      // Check and settle each token
      await checkAndSettle(clients, activeTokens, health);

      // Periodic balance checks (~60s)
      if (tick % MARKET_REFRESH_TICKS === 0) {
        await updateBalances(clients.public, health, config);
      }

      // Periodic USDC sweep
      if (tick % config.sweepIntervalTicks === 0) {
        await trySweep(clients, config, health);
      }

      health.lastPollAt = Date.now();
      health.consecutiveErrors = 0;
    } catch (err) {
      health.consecutiveErrors++;
      logger.error("Poll error", {
        error: err instanceof Error ? err.message : String(err),
        consecutiveErrors: health.consecutiveErrors,
      });
    }

    if (running) {
      timeout = setTimeout(poll, config.pollIntervalMs);
    }
  }

  // Start first poll
  poll();

  return {
    stop: () => {
      running = false;
      if (timeout) clearTimeout(timeout);
    },
  };
}

async function refreshActiveTokens(publicClient: Clients["public"]): Promise<Address[]> {
  const tokens = await publicClient.readContract({
    address: ORACLE_ADDRESS,
    abi: oracleAbi,
    functionName: "getActiveTokens",
  });
  return [...tokens];
}

async function checkAndSettle(
  clients: Clients,
  tokens: Address[],
  health: HealthState,
): Promise<void> {
  if (tokens.length === 0) return;

  // Batch read isLockable and isClosable for all tokens
  const checks = await Promise.all(
    tokens.map(async token => {
      const [lockable, closable] = await Promise.all([
        clients.public.readContract({
          address: PREDICTION_ADDRESS,
          abi: predictionAbi,
          functionName: "isLockable",
          args: [token],
        }),
        clients.public.readContract({
          address: PREDICTION_ADDRESS,
          abi: predictionAbi,
          functionName: "isClosable",
          args: [token],
        }),
      ]);
      return { token, lockable, closable };
    }),
  );

  // Submit transactions sequentially to avoid nonce issues
  for (const { token, lockable, closable } of checks) {
    if (lockable) {
      logger.info("Locking round", { token });
      const result = await submitLockRound(clients, token);
      if (result.status === "sent") health.totalLocks++;
    }
    if (closable) {
      logger.info("Closing round", { token });
      const result = await submitCloseRound(clients, token);
      if (result.status === "sent") health.totalCloses++;
    }
  }
}

async function updateBalances(
  publicClient: Clients["public"],
  health: HealthState,
  config: Config,
): Promise<void> {
  const [ethBalance, usdcBalance] = await Promise.all([
    publicClient.getBalance({ address: health.walletAddress as Address }),
    publicClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [health.walletAddress as Address],
    }),
  ]);

  health.ethBalance = ethBalance;
  health.usdcBalance = usdcBalance;
  health.lowBalance = ethBalance < config.minEthBalance;

  if (health.lowBalance) {
    logger.warn("Low ETH balance", {
      balance: ethBalance.toString(),
      threshold: config.minEthBalance.toString(),
      wallet: health.walletAddress,
    });
  }
}

async function trySweep(
  clients: Clients,
  config: Config,
  health: HealthState,
): Promise<void> {
  // Read fresh balance for sweep decision
  const usdcBalance = await clients.public.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [health.walletAddress as Address],
  });

  health.usdcBalance = usdcBalance;

  if (usdcBalance >= config.sweepThresholdUsdc) {
    logger.info("Sweeping USDC fees", {
      balance: usdcBalance.toString(),
      recipient: config.sweepRecipient,
    });
    const result = await sweepUsdc(clients, config.sweepRecipient, usdcBalance);
    if (result.status === "sent") {
      health.totalSwept += usdcBalance;
      health.usdcBalance = 0n;
    }
  }
}
