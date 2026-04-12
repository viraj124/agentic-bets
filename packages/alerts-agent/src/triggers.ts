import { type Market, fetchMarkets } from "./bankr.js";
import { type Config } from "./config.js";
import { type Db } from "./db.js";
import { logger } from "./logger.js";
import { type TelegramClient } from "./telegram.js";

export async function runTriggers(config: Config, telegram: TelegramClient, db: Db): Promise<void> {
  const markets = await fetchMarkets(config.bankrApiUrl);
  await runT2(markets, config, telegram, db);
}

async function runT2(
  markets: Market[],
  config: Config,
  telegram: TelegramClient,
  db: Db,
): Promise<void> {
  const todayStart = startOfDayUtc();
  const todayCount = await db.countSince("t2", todayStart);
  if (todayCount >= config.t2DailyCap) {
    logger.info("T2 daily cap reached", { count: todayCount, cap: config.t2DailyCap });
    return;
  }

  type Candidate = Market & { secondsToLock: number };

  const candidates: Candidate[] = [];
  for (const m of markets) {
    if (m.status !== "open") continue;
    if (m.secondsToLock === null) continue;
    if (m.secondsToLock < config.t2WindowMinSec || m.secondsToLock > config.t2WindowMaxSec) continue;
    if (m.poolUsdc < config.t2MinPoolUsdc) continue;

    const id = `t2:${m.token.toLowerCase()}:${m.epoch}`;
    if (await db.hasPost(id)) continue;

    candidates.push(m as Candidate);
  }

  if (candidates.length === 0) {
    logger.info("No T2 candidates");
    return;
  }

  candidates.sort((a, b) => b.poolUsdc - a.poolUsdc);
  let posted = 0;
  const remaining = config.t2DailyCap - todayCount;

  for (const candidate of candidates) {
    if (posted >= remaining) break;

    const id = `t2:${candidate.token.toLowerCase()}:${candidate.epoch}`;
    const content = formatT2(candidate);
    try {
      const messageId = await telegram.post(content);
      if (messageId === null) {
        logger.info("T2 dry-run (not recorded)", { id, pool: candidate.poolUsdc, symbol: candidate.symbol });
        continue;
      }
      await db.recordPost(id, "t2", content, messageId);
      logger.info("T2 posted", { id, pool: candidate.poolUsdc, symbol: candidate.symbol });
      posted++;
    } catch (err) {
      logger.error("T2 post failed", { id, error: err instanceof Error ? err.message : String(err) });
    }
  }
}

function formatT2(m: Market & { secondsToLock: number }): string {
  const bull = Math.round(m.bullPct);
  const bear = 100 - bull;
  return [
    `⏱ <b>$${escapeHtml(m.symbol)}</b> round closes in ~${m.secondsToLock}s`,
    ``,
    `Pool: $${m.poolUsdc.toFixed(2)}`,
    `📈 UP: ${bull}%`,
    `📉 DOWN: ${bear}%`,
    ``,
    `Bet here:`,
    m.marketUrl,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function startOfDayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
