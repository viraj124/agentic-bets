import { type Address } from "viem";
import { oracleAbi, predictionAbi, erc20Abi } from "./abis.js";
import {
  type Config,
  ORACLE_ADDRESS,
  ORACLE_ADDRESS_V2,
  PREDICTION_ADDRESS,
  PREDICTION_ADDRESS_V2,
  USDC_ADDRESS,
  ZERO_ADDRESS,
  MARKET_REFRESH_TICKS,
} from "./config.js";
import { type HealthState } from "./health.js";
import { type Clients, submitLockRound, submitCloseRound, sweepUsdc } from "./tx.js";
import { logger } from "./logger.js";

type TokenMarket = { token: Address; predictionAddress: Address };

export function startKeeper(
  clients: Clients,
  config: Config,
  health: HealthState,
): { stop: () => void } {
  let tick = 0;
  let activeTokens: TokenMarket[] = [];
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

async function refreshActiveTokens(publicClient: Clients["public"]): Promise<TokenMarket[]> {
  const result: TokenMarket[] = [];

  // V1 Oracle — existing markets
  const v1Tokens = (await publicClient.readContract({
    address: ORACLE_ADDRESS,
    abi: oracleAbi,
    functionName: "getActiveTokens",
  })) as Address[];
  for (const token of v1Tokens) {
    result.push({ token, predictionAddress: PREDICTION_ADDRESS });
  }

  // V2 Oracle — only if deployed (not the zero placeholder)
  if (ORACLE_ADDRESS_V2 !== ZERO_ADDRESS && PREDICTION_ADDRESS_V2 !== ZERO_ADDRESS) {
    try {
      const v2Tokens = (await publicClient.readContract({
        address: ORACLE_ADDRESS_V2,
        abi: oracleAbi,
        functionName: "getActiveTokens",
      })) as Address[];
      for (const token of v2Tokens) {
        result.push({ token, predictionAddress: PREDICTION_ADDRESS_V2 });
      }
    } catch (err) {
      logger.warn("V2 oracle read failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

async function checkAndSettle(
  clients: Clients,
  markets: TokenMarket[],
  health: HealthState,
): Promise<void> {
  if (markets.length === 0) return;

  // Batch read isLockable and isClosable for all (token, predictionAddress) pairs
  const checks = await Promise.all(
    markets.map(async ({ token, predictionAddress }) => {
      const [lockable, closable] = await Promise.all([
        clients.public.readContract({
          address: predictionAddress,
          abi: predictionAbi,
          functionName: "isLockable",
          args: [token],
        }),
        clients.public.readContract({
          address: predictionAddress,
          abi: predictionAbi,
          functionName: "isClosable",
          args: [token],
        }),
      ]);
      return { token, predictionAddress, lockable, closable };
    }),
  );

  // Submit transactions sequentially to avoid nonce issues
  for (const { token, predictionAddress, lockable, closable } of checks) {
    if (lockable) {
      logger.info("Locking round", { token, predictionAddress });
      const result = await submitLockRound(clients, token, predictionAddress);
      if (result.status === "sent") health.totalLocks++;
    }
    if (closable) {
      logger.info("Closing round", { token, predictionAddress });
      const result = await submitCloseRound(clients, token, predictionAddress);
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
