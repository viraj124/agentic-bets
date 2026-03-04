import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { loadConfig } from "./config.js";
import { startHealthServer, createHealthState } from "./health.js";
import { startKeeper } from "./keeper.js";
import { logger } from "./logger.js";

async function main() {
  const config = loadConfig();
  const account = privateKeyToAccount(config.keeperPrivateKey);

  logger.info("Keeper starting", {
    wallet: account.address,
    chain: "base",
    chainId: 8453,
    pollIntervalMs: config.pollIntervalMs,
    sweepRecipient: config.sweepRecipient,
  });

  const publicClient = createPublicClient({
    chain: base,
    transport: http(config.rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(config.rpcUrl),
  });

  const health = createHealthState(account.address);
  const server = startHealthServer(config.port, health);
  const keeper = startKeeper({ wallet: walletClient, public: publicClient }, config, health);

  function shutdown() {
    logger.info("Shutting down");
    keeper.stop();
    server.close(() => {
      logger.info("Shutdown complete");
      process.exit(0);
    });
    // Force exit after 5s if server doesn't close
    setTimeout(() => process.exit(0), 5_000);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch(err => {
  logger.error("Fatal error", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
