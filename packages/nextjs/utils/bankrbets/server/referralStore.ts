import "server-only";

export interface ReferralRecord {
  referrer: string;
  referee: string;
  createdAt: number;
}

type ReferralResult = { success: boolean; message: string };
type RedisCommand = Array<string | number>;

interface RedisResponse<T> {
  result?: T;
  error?: string;
}

const REFERRAL_PREFIX = "agenticbets:referrals";

// Local fallback keeps dev/test usable without Redis env vars. Production should set
// KV_REST_* or UPSTASH_REDIS_REST_* so referrals survive deploys and cold starts.
const inMemoryReferrals = new Map<string, ReferralRecord>(); // key = referee address (lowercase)

function getRedisConfig() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url && !token) return null;
  if (!url || !token) {
    throw new Error("Referral Redis is partially configured. Set both REST URL and REST token.");
  }

  return { url: url.replace(/\/$/, ""), token };
}

function refereeKey(referee: string) {
  return `${REFERRAL_PREFIX}:referee:${referee}`;
}

function referrerSetKey(referrer: string) {
  return `${REFERRAL_PREFIX}:referrer:${referrer}:referees`;
}

function parseReferralRecord(raw: unknown): ReferralRecord | null {
  if (typeof raw !== "string") return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ReferralRecord>;
    if (
      typeof parsed.referrer !== "string" ||
      typeof parsed.referee !== "string" ||
      typeof parsed.createdAt !== "number"
    ) {
      return null;
    }

    return {
      referrer: parsed.referrer.toLowerCase(),
      referee: parsed.referee.toLowerCase(),
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

async function redisCommand<T>(command: RedisCommand): Promise<T> {
  const config = getRedisConfig();
  if (!config) {
    throw new Error("Referral Redis is not configured.");
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Referral Redis command failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as RedisResponse<T>;
  if (payload.error) {
    throw new Error(`Referral Redis command failed: ${payload.error}`);
  }

  return payload.result as T;
}

function registerReferralInMemory(refereeLower: string, record: ReferralRecord): ReferralResult {
  if (inMemoryReferrals.has(refereeLower)) {
    return { success: false, message: "Already referred" };
  }

  inMemoryReferrals.set(refereeLower, record);

  return { success: true, message: "Referral registered" };
}

export async function registerReferral(referee: string, referrer: string): Promise<ReferralResult> {
  const refereeLower = referee.toLowerCase();
  const referrerLower = referrer.toLowerCase();

  if (refereeLower === referrerLower) {
    return { success: false, message: "Cannot refer yourself" };
  }

  const record = {
    referrer: referrerLower,
    referee: refereeLower,
    createdAt: Date.now(),
  };

  if (!getRedisConfig()) {
    return registerReferralInMemory(refereeLower, record);
  }

  const created = await redisCommand<number>([
    "EVAL",
    `
      if redis.call("EXISTS", KEYS[1]) == 1 then
        return 0
      end
      redis.call("SET", KEYS[1], ARGV[1])
      redis.call("SADD", KEYS[2], ARGV[1])
      return 1
    `,
    2,
    refereeKey(refereeLower),
    referrerSetKey(referrerLower),
    JSON.stringify(record),
  ]);

  if (created !== 1) {
    return { success: false, message: "Already referred" };
  }

  return { success: true, message: "Referral registered" };
}

export async function getReferrer(referee: string): Promise<string | null> {
  const refereeLower = referee.toLowerCase();

  if (!getRedisConfig()) {
    return inMemoryReferrals.get(refereeLower)?.referrer ?? null;
  }

  return parseReferralRecord(await redisCommand<string | null>(["GET", refereeKey(refereeLower)]))?.referrer ?? null;
}

export async function getReferralsByReferrer(referrer: string): Promise<ReferralRecord[]> {
  const referrerLower = referrer.toLowerCase();

  if (!getRedisConfig()) {
    return Array.from(inMemoryReferrals.values()).filter(r => r.referrer === referrerLower);
  }

  const records = await redisCommand<string[]>(["SMEMBERS", referrerSetKey(referrerLower)]);

  return records.map(parseReferralRecord).filter((record): record is ReferralRecord => record !== null);
}

export async function getAllReferrals(): Promise<ReferralRecord[]> {
  if (!getRedisConfig()) {
    return Array.from(inMemoryReferrals.values());
  }

  const records: ReferralRecord[] = [];
  let cursor = "0";

  do {
    const [nextCursor, keys] = await redisCommand<[string, string[]]>([
      "SCAN",
      cursor,
      "MATCH",
      `${REFERRAL_PREFIX}:referee:*`,
      "COUNT",
      100,
    ]);

    if (keys.length > 0) {
      const rawRecords = await redisCommand<Array<string | null>>(["MGET", ...keys]);
      for (const rawRecord of rawRecords) {
        const record = parseReferralRecord(rawRecord);
        if (record) records.push(record);
      }
    }

    cursor = nextCursor;
  } while (cursor !== "0");

  return records;
}
