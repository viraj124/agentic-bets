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

const CACHE_TTL_MS = 10 * 60_000; // 10 minutes
const EMPTY_RETRY_TTL_MS = 60_000; // retry empty results after 1 min
const RESOLVED_POOL_TTL_MS = 10 * 60_000; // cache token→bestPool for 10 min
const PROVIDER_COOLDOWN_MS = 45_000; // skip a provider for 45s after a 429

const cache = new Map<string, { ts: number; data: OhlcvCandle[] }>();
const resolvedPoolCache = new Map<string, { pool: string; ts: number }>();
// Per-provider 429 cooldown: "gecko" | "dexscreener" → timestamp until available
const rateLimitedUntil = new Map<string, number>();

const FETCH_TIMEOUT_MS = 8_000;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Map aggregate minutes from the client into the correct GeckoTerminal
 * timeframe endpoint + aggregate value.
 *
 * GeckoTerminal supports:
 *   /ohlcv/minute  → aggregate 1, 5, 15
 *   /ohlcv/hour    → aggregate 1, 4, 12
 *   /ohlcv/day     → aggregate 1
 */
function resolveGeckoTimeframe(aggregateMinutes: number): { timeframe: string; aggregate: number } {
  if (aggregateMinutes <= 15) {
    // 1, 5, 15 → minute endpoint
    return { timeframe: "minute", aggregate: aggregateMinutes };
  }
  if (aggregateMinutes < 1440) {
    // 60 → 1 hour, 240 → 4 hours, 720 → 12 hours
    const hours = Math.round(aggregateMinutes / 60);
    // Snap to nearest valid value: 1, 4, 12
    const valid = [1, 4, 12];
    const snapped = valid.reduce((prev, curr) => (Math.abs(curr - hours) < Math.abs(prev - hours) ? curr : prev));
    return { timeframe: "hour", aggregate: snapped };
  }
  // 1440+ → day endpoint
  return { timeframe: "day", aggregate: 1 };
}

function isRateLimited(provider: string): boolean {
  const until = rateLimitedUntil.get(provider);
  return until !== undefined && Date.now() < until;
}

function markRateLimited(provider: string, ms = PROVIDER_COOLDOWN_MS) {
  rateLimitedUntil.set(provider, Date.now() + ms);
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isHexAddress(value: string): boolean {
  return /^0x[a-f0-9]{40}$/.test(value);
}

function isHexBytes32(value: string): boolean {
  return /^0x[a-f0-9]{64}$/.test(value);
}

function extractAddressFromGeckoId(id: string): string {
  if (!id) return "";
  for (const part of id.split("_")) {
    const lower = part.toLowerCase();
    if (isHexAddress(lower) || isHexBytes32(lower)) return lower;
  }
  return "";
}

/**
 * Normalise raw rows [[timestamp, open, high, low, close], ...] into
 * deduplicated, strictly-increasing OhlcvCandle[].
 */
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
      deduped[deduped.length - 1] = candle;
      continue;
    }
    deduped.push(candle);
    lastTime = candle.time;
  }

  // Low-liquidity pools may return a single candle → duplicate it back 5 min
  // to prevent a blank chart.
  if (deduped.length === 1) {
    const single = deduped[0];
    deduped.unshift({ ...single, time: Math.max(0, single.time - 300) });
  }

  return deduped;
}

// ── GeckoTerminal ─────────────────────────────────────────────────────────────

/**
 * Fetch OHLCV from GeckoTerminal. Detects 429 and marks the provider as
 * rate-limited so subsequent calls skip it during the cooldown window.
 */
async function fetchGeckoOhlcv(
  pool: string,
  aggregate: string,
  limit: string,
  currency: string,
): Promise<OhlcvCandle[] | null> {
  if (isRateLimited("gecko")) return null;

  const aggMinutes = parseInt(aggregate, 10) || 5;
  const { timeframe, aggregate: geckoAgg } = resolveGeckoTimeframe(aggMinutes);
  const url = `https://api.geckoterminal.com/api/v2/networks/base/pools/${pool}/ohlcv/${timeframe}?aggregate=${geckoAgg}&limit=${limit}&currency=${currency}`;

  // One-shot fetch so we can inspect the status code for 429.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, next: { revalidate: 300 } });
    if (res.status === 429) {
      markRateLimited("gecko");
      return null;
    }
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    if (toNumber(json?.status?.error_code) > 0) return null;
    const list = (json?.data?.attributes?.ohlcv_list || []) as number[][];
    return toCandles(list);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ── DexScreener ───────────────────────────────────────────────────────────────

/**
 * Fetch OHLCV candles from DexScreener's chart endpoint.
 * Response format: TradingView-compatible parallel arrays {t, o, h, l, c, v}.
 * Timestamps are in seconds.
 */
async function fetchDexScreenerOhlcv(pool: string, aggregate: string, limit: string): Promise<OhlcvCandle[] | null> {
  if (isRateLimited("dexscreener")) return null;

  const cb = Date.now();
  // DexScreener res param: 1, 5, 15, 30, 60, 240, 720, 1D
  const aggMinutes = parseInt(aggregate, 10) || 5;
  const dexRes = aggMinutes >= 1440 ? "1D" : String(aggMinutes);
  const url = `https://io.dexscreener.com/dex/chart/amm/v3/base/${pool}?res=${dexRes}&cb=${cb}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 0 },
    });
    if (res.status === 429) {
      markRateLimited("dexscreener");
      return null;
    }
    if (!res.ok) return null;

    const json = (await res.json()) as any;

    // TradingView-style parallel arrays
    const t: number[] = Array.isArray(json?.t) ? json.t : [];
    const o: number[] = Array.isArray(json?.o) ? json.o : [];
    const h: number[] = Array.isArray(json?.h) ? json.h : [];
    const l: number[] = Array.isArray(json?.l) ? json.l : [];
    const c: number[] = Array.isArray(json?.c) ? json.c : [];

    if (t.length === 0) return null;

    const limitN = parseInt(limit, 10) || 120;
    // Slice to the requested limit from the end (most recent candles)
    const start = Math.max(0, t.length - limitN);
    const rows: number[][] = [];
    for (let i = start; i < t.length; i++) {
      rows.push([t[i], o[i] ?? 0, h[i] ?? 0, l[i] ?? 0, c[i] ?? 0]);
    }

    return toCandles(rows);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolve the highest-volume DexScreener pair address for a given token on Base.
 */
async function resolveBestPoolFromDexScreener(token: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`, {
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const pairs: any[] = Array.isArray(json?.pairs) ? json.pairs : [];

    let bestPair: any = null;
    let bestScore = -1;
    for (const pair of pairs) {
      if ((pair?.chainId || "").toLowerCase() !== "base") continue;
      const addr = (pair?.pairAddress || "").toLowerCase();
      if (!isHexAddress(addr) && !isHexBytes32(addr)) continue;
      const score = toNumber(pair?.volume?.h24) + toNumber(pair?.liquidity?.usd) * 0.1;
      if (score > bestScore) {
        bestScore = score;
        bestPair = pair;
      }
    }
    return bestPair ? (bestPair.pairAddress as string).toLowerCase() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolve the best pool for a token. Tries GeckoTerminal first (unless rate-limited),
 * falls back to DexScreener.
 */
async function resolveBestPoolForToken(token: string): Promise<string | null> {
  const entry = resolvedPoolCache.get(token);
  if (entry && Date.now() - entry.ts < RESOLVED_POOL_TTL_MS) {
    return entry.pool || null;
  }

  let bestAddress = "";

  if (!isRateLimited("gecko")) {
    const url = `https://api.geckoterminal.com/api/v2/networks/base/tokens/${token}/pools`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, next: { revalidate: 300 } });
      if (res.status === 429) {
        markRateLimited("gecko");
      } else if (res.ok) {
        const json = (await res.json()) as { data?: GeckoTokenPool[] };
        const pools = Array.isArray(json?.data) ? json.data : [];
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
      }
    } catch {
      // ignore
    } finally {
      clearTimeout(timeout);
    }
  }

  // Fallback to DexScreener if Gecko gave us nothing
  if (!bestAddress) {
    bestAddress = (await resolveBestPoolFromDexScreener(token)) || "";
  }

  resolvedPoolCache.set(token, { pool: bestAddress, ts: Date.now() });
  return bestAddress || null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * Try to get candles for a specific pool using Gecko → DexScreener fallback.
 */
async function fetchCandlesForPool(
  pool: string,
  aggregate: string,
  limit: string,
  currency: string,
): Promise<OhlcvCandle[] | null> {
  const geckoCandles = await fetchGeckoOhlcv(pool, aggregate, limit, currency);
  if (geckoCandles && geckoCandles.length > 0) return geckoCandles;

  const dexCandles = await fetchDexScreenerOhlcv(pool, aggregate, limit);
  if (dexCandles && dexCandles.length > 0) return dexCandles;

  return geckoCandles; // null or []
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

  // Serve fresh cache immediately (only if it has data — empty results use shorter TTL below)
  if (cached && cached.data.length > 0 && Date.now() - cached.ts < CACHE_TTL_MS) {
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

  // ── Fetch candles (Gecko → DexScreener, then pool resolution fallback) ──

  let candles = await fetchCandlesForPool(pool, aggregate, limit, currency);

  // Pool resolution fallback: when pool has no candles, find the best pool
  // for this token and retry both providers with it.
  if ((candles === null || candles.length === 0) && token && isHexAddress(token)) {
    const resolvedPool = await resolveBestPoolForToken(token);
    if (resolvedPool && resolvedPool !== pool) {
      const resolvedCandles = await fetchCandlesForPool(resolvedPool, aggregate, limit, currency);
      if (resolvedCandles && resolvedCandles.length > 0) {
        candles = resolvedCandles;
        // Warm the cache under the resolved pool key too
        const resolvedKey = `${resolvedPool}-${token}-${aggregate}-${limit}-${currency}`;
        cache.set(resolvedKey, { ts: Date.now(), data: candles });
      }
    }
  }

  // Provider failure: return stale cache or empty array (never 503)
  if (candles === null) {
    if (cached) {
      return Response.json(cached.data, {
        headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
      });
    }
    // Cache the empty result so we don't keep retrying immediately
    cache.set(cacheKey, { ts: Date.now(), data: [] });
    return Response.json([], {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
    });
  }

  // Cache — empty arrays use EMPTY_RETRY_TTL so we retry sooner
  cache.set(cacheKey, { ts: Date.now(), data: candles });

  return Response.json(candles, {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });
}
