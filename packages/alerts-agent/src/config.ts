export type Config = {
  bankrApiUrl: string;
  databaseUrl: string;
  alertsDryRun: boolean;
  telegramBotToken: string | undefined;
  telegramChatId: string | undefined;
  pollIntervalMs: number;
  t2CooldownMs: number;
  t2DailyCap: number;
  t2MinPoolUsdc: number;
  t2WindowMinSec: number;
  t2WindowMaxSec: number;
};

export function loadConfig(): Config {
  const bankrApiUrl = requireEnv("BANKR_API_URL");
  const databaseUrl = requireEnv("DATABASE_URL");
  const alertsDryRun = boolEnv("ALERTS_DRY_RUN", true);

  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  if (!alertsDryRun && (!telegramBotToken || !telegramChatId)) {
    throw new Error("ALERTS_DRY_RUN=false requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID");
  }

  return {
    bankrApiUrl,
    databaseUrl,
    alertsDryRun,
    telegramBotToken,
    telegramChatId,
    pollIntervalMs: intEnv("POLL_INTERVAL_MS", 60_000),
    t2CooldownMs: intEnv("T2_COOLDOWN_MS", 100 * 60 * 1000),
    t2DailyCap: intEnv("T2_DAILY_CAP", 13),
    t2MinPoolUsdc: floatEnv("T2_MIN_POOL_USDC", 10),
    t2WindowMinSec: intEnv("T2_WINDOW_MIN_SEC", 30),
    t2WindowMaxSec: intEnv("T2_WINDOW_MAX_SEC", 120),
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function intEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

function floatEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseFloat(raw);
  if (isNaN(parsed)) throw new Error(`${name} must be a number`);
  return parsed;
}

function boolEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const normalized = raw.toLowerCase();
  return normalized === "true" || normalized === "1";
}
