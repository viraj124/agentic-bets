import { loadConfig } from "./config.js";
import { createDb } from "./db.js";
import { logger } from "./logger.js";
import { createTelegramClient } from "./telegram.js";
import { runTriggers } from "./triggers.js";

async function main() {
  const config = loadConfig();

  logger.info("Alerts agent starting", {
    pollIntervalMs: config.pollIntervalMs,
    dryRun: config.alertsDryRun,
    t2Cap: config.t2DailyCap,
    t2MinPool: config.t2MinPoolUsdc,
    bankrApiUrl: config.bankrApiUrl,
  });

  const db = createDb(config.databaseUrl);
  await db.init();

  const telegram = createTelegramClient(config);

  let running = true;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  async function poll() {
    if (!running) return;

    try {
      await runTriggers(config, telegram, db);
    } catch (err) {
      logger.error("Poll error", { error: err instanceof Error ? err.message : String(err) });
    }

    if (running) {
      timeout = setTimeout(poll, config.pollIntervalMs);
    }
  }

  function shutdown() {
    logger.info("Shutting down");
    running = false;
    if (timeout) clearTimeout(timeout);
    db.close()
      .then(() => {
        logger.info("Shutdown complete");
        process.exit(0);
      })
      .catch(err => {
        logger.error("DB close failed during shutdown", {
          error: err instanceof Error ? err.message : String(err),
        });
        process.exit(1);
      });
    setTimeout(() => process.exit(0), 5_000);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await poll();
}

main().catch(err => {
  logger.error("Fatal error", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
