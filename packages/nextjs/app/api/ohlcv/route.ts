import { NextRequest } from "next/server";

interface OhlcvCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface GeckoTokenPool {
  id?: string;
  attributes?: {
    address?: string;
    volume_usd?: { h24?: string | number };
  };
}

const CACHE_TTL_MS = 5 * 60_000; // 5 minutes — mini charts don't need real-time data
const EMPTY_RETRY_TTL_MS = 60_000; // retry empty results after 1 min (not 5)
const RESOLVED_POOL_TTL_MS = 10 * 60_000; // cache token→bestPool for 10 min

const cache = new Map<string, { ts: number; data: OhlcvCandle[] }>();
// Separate cache: token address → best GeckoTerminal pool address
const resolvedPoolCache = new Map<string, { pool: string; ts: number }>();

const FETCH_TIMEOUT_MS = 8_000;
const FETCH_RETRIES = 2;

function toCandles(list: number[][]): OhlcvCandle[] {
  const normalized: OhlcvCandle[] = [];
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const time = Math.floor(toNumber(row[0]));
    const open = toNumber(row[1]);
    const high = toNumber(row[2]);
    const low = toNumber(row[3]);
    const close = toNumber(row[4]);
    if (time <= 0) continue;
    if (![open, high, low, close].every(Number.isFinite)) continue;
    normalized.push({ time, open, high, low, close });
  }

  normalized.sort((a, b) => a.time - b.time);

  // Lightweight Charts requires strictly increasing unique timestamps.
  const deduped: OhlcvCandle[] = [];
  let lastTime = -1;
  for (const candle of normalized) {
    if (candle.time === lastTime && deduped.length > 0) {
      deduped[deduped.length - 1] = candle; // keep latest entry for duplicate timestamp
      continue;
    }
    deduped.push(candle);
    lastTime = candle.time;
  }

  // Some low-liquidity pools only return one candle, which can render as a blank chart.
  if (deduped.length === 1) {
    const single = deduped[0];
    deduped.unshift({ ...single, time: Math.max(0, single.time - 300) });
  }

  return deduped;
}

function isHexAddress(value: string): boolean {
  return /^0x[a-f0-9]{40}$/.test(value);
}

function isHexBytes32(value: string): boolean {
  return /^0x[a-f0-9]{64}$/.test(value);
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function extractAddressFromGeckoId(id: string): string {
  if (!id) return "";
  for (const part of id.split("_")) {
    const lower = part.toLowerCase();
    if (isHexAddress(lower) || isHexBytes32(lower)) return lower;
  }
  return "";
}

async function fetchJson<T>(url: string): Promise<T | null> {
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, next: { revalidate: 300 } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as any;
      // Gecko may return HTTP 200 with an embedded error payload.
      if (toNumber(json?.status?.error_code) > 0) throw new Error(`Gecko error ${json.status.error_code}`);
      return json as T;
    } catch {
      if (attempt === FETCH_RETRIES) return null;
      await new Promise(r => setTimeout(r, 150 * (attempt + 1)));
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function fetchPoolOhlcv(
  pool: string,
  aggregate: string,
  limit: string,
  currency: string,
): Promise<OhlcvCandle[] | null> {
  const url = `https://api.geckoterminal.com/api/v2/networks/base/pools/${pool}/ohlcv/minute?aggregate=${aggregate}&limit=${limit}&currency=${currency}`;
  const json = await fetchJson<any>(url);
  if (!json) return null;
  const list = (json?.data?.attributes?.ohlcv_list || []) as number[][];
  return toCandles(list);
}

async function resolveBestPoolForToken(token: string): Promise<string | null> {
  // Check cache first to avoid hitting GeckoTerminal rate limits
  const entry = resolvedPoolCache.get(token);
  if (entry && Date.now() - entry.ts < RESOLVED_POOL_TTL_MS) {
    return entry.pool || null;
  }

  const url = `https://api.geckoterminal.com/api/v2/networks/base/tokens/${token}/pools`;
  const json = await fetchJson<{ data?: GeckoTokenPool[] }>(url);
  const pools = Array.isArray(json?.data) ? json.data : [];

  let bestAddress = "";
  let bestScore = -1;
  for (const pool of pools) {
    const address =
      (pool.attributes?.address || "").toLowerCase() || extractAddressFromGeckoId((pool.id || "").toLowerCase());
    if (!isHexAddress(address) && !isHexBytes32(address)) continue;
    const score = toNumber(pool.attributes?.volume_usd?.h24);
    if (score > bestScore) {
      bestAddress = address;
      bestScore = score;
    }
  }

  // Cache even empty results to avoid hammering GeckoTerminal for unknown tokens
  resolvedPoolCache.set(token, { pool: bestAddress, ts: Date.now() });
  return bestAddress || null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pool = (searchParams.get("pool") || "").toLowerCase();
  const token = (searchParams.get("token") || "").toLowerCase();
  const aggregate = searchParams.get("aggregate") || "5";
  const limit = searchParams.get("limit") || "120";
  const currency = searchParams.get("currency") || "usd";

  if (!pool || (!isHexAddress(pool) && !isHexBytes32(pool))) {
    return Response.json({ error: "Missing pool param" }, { status: 400 });
  }

  const cacheKey = `${pool}-${token}-${aggregate}-${limit}-${currency}`;
  const cached = cache.get(cacheKey);

  // Serve fresh cache immediately
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return Response.json(cached.data, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  }

  // Empty-result short-retry: if previous result was empty, retry after 1 min not 5
  const isStaleEmpty = cached && cached.data.length === 0 && Date.now() - cached.ts < EMPTY_RETRY_TTL_MS;
  if (isStaleEmpty) {
    return Response.json([], {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
    });
  }

  let candles = await fetchPoolOhlcv(pool, aggregate, limit, currency);
  let resolvedPool: string | null = null;

  // Fallback: resolve the token's best pool and retry when pool input has no candles/error.
  if ((candles === null || candles.length === 0) && token && isHexAddress(token)) {
    resolvedPool = await resolveBestPoolForToken(token);
    if (resolvedPool && resolvedPool !== pool) {
      candles = await fetchPoolOhlcv(resolvedPool, aggregate, limit, currency);
      // Also warm the cache under the resolved pool key
      if (candles && candles.length > 0) {
        const resolvedKey = `${resolvedPool}-${token}-${aggregate}-${limit}-${currency}`;
        cache.set(resolvedKey, { ts: Date.now(), data: candles });
      }
    }
  }

  // Provider failure: return stale cache if available; do not poison cache with empty transient response.
  if (candles === null) {
    if (cached) {
      return Response.json(cached.data, {
        headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
      });
    }
    return Response.json({ error: "Upstream chart provider unavailable" }, { status: 503 });
  }

  // Only cache non-empty results — empty arrays must not block retries for 5 minutes
  if (candles.length > 0) {
    cache.set(cacheKey, { ts: Date.now(), data: candles });
  } else {
    // Store empty with current timestamp so EMPTY_RETRY_TTL_MS applies on next request
    cache.set(cacheKey, { ts: Date.now(), data: [] });
  }

  return Response.json(candles, {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
