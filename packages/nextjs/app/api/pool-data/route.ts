import { NextRequest } from "next/server";

export const maxDuration = 15;

const GECKO_BASE_URL = "https://api.geckoterminal.com/api/v2/networks/base/pools";
const GECKO_TOKENS_URL = "https://api.geckoterminal.com/api/v2/networks/base/tokens";
const DEXSCREENER_TOKENS_URL = "https://api.dexscreener.com/latest/dex/tokens";

const CACHE_TTL_MS = 2 * 60_000; // 2 minutes
const FETCH_TIMEOUT_MS = 6_000;
const PROVIDER_COOLDOWN_MS = 60_000;

const cache = new Map<string, { ts: number; data: any }>();
const rateLimitedUntil = new Map<string, number>();

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isHexAddress(v: string): boolean {
  return /^0x[a-f0-9]{40}$/.test(v);
}

function isPoolId(v: string): boolean {
  return /^0x[a-f0-9]{40}$/.test(v) || /^0x[a-f0-9]{64}$/.test(v);
}

function isRateLimited(provider: string): boolean {
  const until = rateLimitedUntil.get(provider);
  return until !== undefined && Date.now() < until;
}

function markRateLimited(provider: string) {
  rateLimitedUntil.set(provider, Date.now() + PROVIDER_COOLDOWN_MS);
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, next: { revalidate: 120 } });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Single pool ──────────────────────────────────────────────────────────────

async function fetchGeckoPool(pool: string) {
  if (isRateLimited("gecko")) return null;
  const res = await fetchWithTimeout(`${GECKO_BASE_URL}/${pool}`);
  if (!res) return null;
  if (res.status === 429) {
    markRateLimited("gecko");
    return null;
  }
  if (!res.ok) return null;
  const json = await res.json();
  return json?.data?.attributes ?? null;
}

async function fetchDexScreenerToken(token: string, preferredPool?: string) {
  if (isRateLimited("dexscreener")) return null;
  const res = await fetchWithTimeout(`${DEXSCREENER_TOKENS_URL}/${token}`);
  if (!res) return null;
  if (res.status === 429) {
    markRateLimited("dexscreener");
    return null;
  }
  if (!res.ok) return null;
  const json = await res.json();
  const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
  if (pairs.length === 0) return null;

  const preferred = (preferredPool || "").toLowerCase();
  let bestPair: any = null;
  let bestScore = -1;
  for (const pair of pairs) {
    if ((pair?.chainId || "").toLowerCase() !== "base") continue;
    const addr = (pair?.pairAddress || "").toLowerCase();
    if (!addr) continue;
    if (preferred && addr === preferred) {
      bestPair = pair;
      break;
    }
    const score = toNumber(pair?.volume?.h24) + toNumber(pair?.liquidity?.usd) * 0.1;
    if (score > bestScore) {
      bestScore = score;
      bestPair = pair;
    }
  }
  return bestPair;
}

function geckoAttrsToPoolData(attrs: any, poolAddress: string) {
  return {
    priceUsd: toNumber(attrs.base_token_price_usd),
    change1h: toNumber(attrs.price_change_percentage?.h1),
    marketCap: toNumber(attrs.market_cap_usd) || toNumber(attrs.fdv_usd),
    volume24h: toNumber(attrs.volume_usd?.h24),
    poolAddress,
    tokenName: attrs.name || "",
    tokenSymbol: "",
  };
}

function dexPairToPoolData(pair: any) {
  return {
    priceUsd: toNumber(pair.priceUsd),
    change1h: toNumber(pair.priceChange?.h1),
    marketCap: toNumber(pair.marketCap) || toNumber(pair.fdv),
    volume24h: toNumber(pair.volume?.h24),
    poolAddress: (pair.pairAddress || "").toLowerCase(),
    tokenName: pair.baseToken?.symbol
      ? `${pair.baseToken.symbol}/${pair.quoteToken?.symbol || "USD"}`
      : pair.baseToken?.name || "",
    tokenSymbol: pair.baseToken?.symbol || "",
  };
}

function isHexBytes32(v: string): boolean {
  return /^0x[a-f0-9]{64}$/.test(v);
}

async function resolveBestPoolForToken(token: string): Promise<string | null> {
  if (isRateLimited("gecko")) return null;
  const res = await fetchWithTimeout(`${GECKO_TOKENS_URL}/${token}/pools`);
  if (!res) return null;
  if (res.status === 429) {
    markRateLimited("gecko");
    return null;
  }
  if (!res.ok) return null;
  const json = await res.json();
  const pools = Array.isArray(json?.data) ? json.data : [];

  // Prefer regular 20-byte addresses over V4 pool IDs (bytes32) — regular
  // addresses work more reliably with OHLCV providers.
  let bestAddr20 = "";
  let bestScore20 = -1;
  let bestAddr32 = "";
  let bestScore32 = -1;
  for (const pool of pools) {
    const address =
      (pool?.attributes?.address || "").toLowerCase() || extractAddressFromGeckoId((pool?.id || "").toLowerCase());
    const score = toNumber(pool?.attributes?.volume_usd?.h24);
    if (isHexAddress(address)) {
      if (score > bestScore20) {
        bestAddr20 = address;
        bestScore20 = score;
      }
    } else if (isHexBytes32(address)) {
      if (score > bestScore32) {
        bestAddr32 = address;
        bestScore32 = score;
      }
    }
  }
  return bestAddr20 || bestAddr32 || null;
}

function extractAddressFromGeckoId(id: string): string {
  if (!id) return "";
  for (const part of id.split("_")) {
    if (isPoolId(part)) return part;
  }
  return "";
}

async function getSinglePoolData(pool: string, token: string) {
  // Try Gecko pool directly
  if (pool && isPoolId(pool)) {
    const attrs = await fetchGeckoPool(pool);
    if (attrs) return geckoAttrsToPoolData(attrs, pool);
  }

  // Try resolving best pool for token
  if (token && isHexAddress(token)) {
    const resolved = await resolveBestPoolForToken(token);
    if (resolved && resolved !== pool) {
      const attrs = await fetchGeckoPool(resolved);
      if (attrs) return geckoAttrsToPoolData(attrs, resolved);
    }
  }

  // Fallback to DexScreener
  if (token && isHexAddress(token)) {
    const pair = await fetchDexScreenerToken(token, pool);
    if (pair) return dexPairToPoolData(pair);
  }

  return null;
}

// ── Multi pool ───────────────────────────────────────────────────────────────

async function getMultiPoolData(pools: string[]) {
  if (isRateLimited("gecko")) return [];
  const addresses = pools.join(",");
  const res = await fetchWithTimeout(`${GECKO_BASE_URL}/multi/${addresses}`);
  if (!res) return [];
  if (res.status === 429) {
    markRateLimited("gecko");
    return [];
  }
  if (!res.ok) return [];
  const json = await res.json();
  return (json.data || []).map((pool: any) => {
    const attrs = pool.attributes;
    return geckoAttrsToPoolData(attrs, attrs.address || pool.id?.split("_")[1] || "");
  });
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pool = (searchParams.get("pool") || "").toLowerCase();
  const token = (searchParams.get("token") || "").toLowerCase();
  const pools = searchParams.get("pools") || "";

  // Multi-pool mode
  if (pools) {
    const poolList = pools.toLowerCase().split(",").filter(isPoolId);
    if (poolList.length === 0) {
      return Response.json({ error: "Invalid pools param" }, { status: 400 });
    }

    const cacheKey = `multi:${poolList.join(",")}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return Response.json(cached.data, {
        headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" },
      });
    }

    const data = await getMultiPoolData(poolList);
    if (data.length > 0) cache.set(cacheKey, { ts: Date.now(), data });

    const result = data.length > 0 ? data : (cached?.data ?? []);
    return Response.json(result, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" },
    });
  }

  // Single-pool mode
  if (!pool && !token) {
    return Response.json({ error: "Missing pool or token param" }, { status: 400 });
  }

  const cacheKey = `single:${pool}:${token}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return Response.json(cached.data, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" },
    });
  }

  const data = await getSinglePoolData(pool, token);
  if (data) cache.set(cacheKey, { ts: Date.now(), data });

  const result = data ?? cached?.data ?? null;
  if (!result) {
    return Response.json({ error: "Unable to fetch pool data" }, { status: 503 });
  }

  return Response.json(result, {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" },
  });
}
