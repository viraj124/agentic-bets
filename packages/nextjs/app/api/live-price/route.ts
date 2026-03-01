import { NextRequest } from "next/server";

type LivePriceSnapshot = {
  priceUsd: number;
  source: "gecko-pool" | "dexscreener-token" | "gecko-token-pools";
  updatedAt: number;
  poolAddress?: string;
  tokenAddress?: string;
};

type GeckoPoolResponse = {
  data?: {
    attributes?: {
      address?: string;
      base_token_price_usd?: string | number;
    };
  };
};

type GeckoTokenPoolsResponse = {
  data?: Array<{
    id?: string;
    attributes?: {
      address?: string;
      base_token_price_usd?: string | number;
      volume_usd?: { h24?: string | number };
    };
  }>;
};

type DexTokenResponse = {
  pairs?: Array<{
    chainId?: string;
    pairAddress?: string;
    priceUsd?: string | number;
    volume?: { h24?: string | number };
    liquidity?: { usd?: string | number };
  }>;
};

type GeckoTokenPool = NonNullable<GeckoTokenPoolsResponse["data"]>[number];
type DexTokenPair = NonNullable<DexTokenResponse["pairs"]>[number];

const GECKO_BASE_URL = "https://api.geckoterminal.com/api/v2/networks/base/pools";
const GECKO_TOKENS_URL = "https://api.geckoterminal.com/api/v2/networks/base/tokens";
const DEXSCREENER_TOKENS_URL = "https://api.dexscreener.com/latest/dex/tokens";

const FETCH_TIMEOUT_MS = 5000;
const SOFT_TTL_MS = 2500;
const DELAYED_AFTER_MS = 15000;
const PROVIDER_COOLDOWN_MS = 45_000; // skip a provider for 45s after a 429

const priceCache = new Map<string, LivePriceSnapshot>();
const inFlight = new Map<string, Promise<LivePriceSnapshot | null>>();
// Per-provider 429 cooldown: "gecko" | "dexscreener" → timestamp until available
const rateLimitedUntil = new Map<string, number>();

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function isPoolId(value: string): boolean {
  return isHexAddress(value) || isHexBytes32(value);
}

function isRateLimited(provider: string): boolean {
  const until = rateLimitedUntil.get(provider);
  return until !== undefined && Date.now() < until;
}

function markRateLimited(provider: string, ms = PROVIDER_COOLDOWN_MS) {
  rateLimitedUntil.set(provider, Date.now() + ms);
}

function extractAddressFromGeckoId(id: string): string {
  if (!id) return "";
  for (const part of id.split("_")) {
    const lower = part.toLowerCase();
    if (isPoolId(lower)) return lower;
  }
  return "";
}

/**
 * One-shot fetch that surfaces the raw HTTP status so callers can detect 429s.
 */
async function fetchRaw(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 0 },
      cache: "no-store",
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Price providers ───────────────────────────────────────────────────────────

async function fetchGeckoPoolPrice(poolAddress: string, tokenAddress?: string): Promise<LivePriceSnapshot | null> {
  if (!poolAddress || !isPoolId(poolAddress)) return null;
  if (isRateLimited("gecko")) return null;

  const res = await fetchRaw(`${GECKO_BASE_URL}/${poolAddress}`);
  if (!res) return null;
  if (res.status === 429) {
    markRateLimited("gecko");
    return null;
  }
  if (!res.ok) return null;

  const json = (await res.json()) as GeckoPoolResponse;
  if (toNumber((json as any)?.status?.error_code) > 0) return null;

  const attrs = json?.data?.attributes;
  const priceUsd = toNumber(attrs?.base_token_price_usd);
  if (!(priceUsd > 0)) return null;

  return {
    priceUsd,
    source: "gecko-pool",
    updatedAt: Date.now(),
    poolAddress: (attrs?.address || poolAddress).toLowerCase(),
    tokenAddress,
  };
}

async function fetchGeckoTokenPoolsPrice(
  tokenAddress: string,
  preferredPool?: string,
): Promise<LivePriceSnapshot | null> {
  if (!tokenAddress || !isHexAddress(tokenAddress)) return null;
  if (isRateLimited("gecko")) return null;

  const res = await fetchRaw(`${GECKO_TOKENS_URL}/${tokenAddress}/pools`);
  if (!res) return null;
  if (res.status === 429) {
    markRateLimited("gecko");
    return null;
  }
  if (!res.ok) return null;

  const json = (await res.json()) as GeckoTokenPoolsResponse;
  const pools = Array.isArray(json?.data) ? json.data : [];
  if (pools.length === 0) return null;

  const preferred = (preferredPool || "").toLowerCase();
  let bestPool: GeckoTokenPool | null = null;
  let bestScore = -1;

  for (const pool of pools) {
    const candidateAddress =
      (pool?.attributes?.address || "").toLowerCase() || extractAddressFromGeckoId((pool?.id || "").toLowerCase());
    if (!candidateAddress || !isPoolId(candidateAddress)) continue;

    if (preferred && candidateAddress === preferred) {
      bestPool = pool;
      break;
    }

    const score = toNumber(pool?.attributes?.volume_usd?.h24);
    if (score > bestScore) {
      bestScore = score;
      bestPool = pool;
    }
  }

  const chosenPrice = toNumber(bestPool?.attributes?.base_token_price_usd);
  if (!bestPool || !(chosenPrice > 0)) return null;

  const chosenAddress =
    (bestPool.attributes?.address || "").toLowerCase() || extractAddressFromGeckoId((bestPool.id || "").toLowerCase());

  return {
    priceUsd: chosenPrice,
    source: "gecko-token-pools",
    updatedAt: Date.now(),
    poolAddress: chosenAddress,
    tokenAddress,
  };
}

async function fetchDexScreenerPrice(tokenAddress: string, preferredPool?: string): Promise<LivePriceSnapshot | null> {
  if (!tokenAddress || !isHexAddress(tokenAddress)) return null;
  if (isRateLimited("dexscreener")) return null;

  const res = await fetchRaw(`${DEXSCREENER_TOKENS_URL}/${tokenAddress}`);
  if (!res) return null;
  if (res.status === 429) {
    markRateLimited("dexscreener");
    return null;
  }
  if (!res.ok) return null;

  const json = (await res.json()) as DexTokenResponse;
  const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
  if (pairs.length === 0) return null;

  const preferred = (preferredPool || "").toLowerCase();
  let bestPair: DexTokenPair | null = null;
  let bestScore = -1;

  for (const pair of pairs) {
    if ((pair?.chainId || "").toLowerCase() !== "base") continue;
    const pairAddress = (pair?.pairAddress || "").toLowerCase();
    if (!pairAddress || !isPoolId(pairAddress)) continue;

    if (preferred && pairAddress === preferred) {
      bestPair = pair;
      break;
    }

    const score = toNumber(pair?.volume?.h24) + toNumber(pair?.liquidity?.usd) * 0.1;
    if (score > bestScore) {
      bestScore = score;
      bestPair = pair;
    }
  }

  const priceUsd = toNumber(bestPair?.priceUsd);
  if (!bestPair || !(priceUsd > 0)) return null;

  return {
    priceUsd,
    source: "dexscreener-token",
    updatedAt: Date.now(),
    poolAddress: (bestPair.pairAddress || "").toLowerCase(),
    tokenAddress,
  };
}

// ── Provider cascade ──────────────────────────────────────────────────────────

/**
 * Fetch the best available live price using a resilient provider cascade.
 *
 * When GeckoTerminal is healthy: Gecko Pool → DexScreener → Gecko Token Pools
 * When GeckoTerminal is rate-limited: DexScreener → Gecko Token Pools (last resort)
 *
 * Providers are called sequentially and the first successful result wins.
 */
async function fetchBestLivePrice(poolAddress: string, tokenAddress: string): Promise<LivePriceSnapshot | null> {
  const geckoDown = isRateLimited("gecko");

  const providers: Array<() => Promise<LivePriceSnapshot | null>> = [];

  if (!geckoDown && poolAddress) {
    // Best source when available: direct pool lookup (fastest, no ambiguity)
    providers.push(() => fetchGeckoPoolPrice(poolAddress, tokenAddress || undefined));
  }

  if (tokenAddress) {
    // DexScreener is always attempted — moves to first when Gecko is rate-limited
    providers.push(() => fetchDexScreenerPrice(tokenAddress, poolAddress || undefined));
  }

  if (tokenAddress) {
    // Gecko token-pools: broader search, always worth trying as final gecko fallback
    providers.push(() => fetchGeckoTokenPoolsPrice(tokenAddress, poolAddress || undefined));
  }

  for (const provider of providers) {
    const snapshot = await provider();
    if (snapshot && snapshot.priceUsd > 0) return snapshot;
  }
  return null;
}

// ── Cache key ─────────────────────────────────────────────────────────────────

function getCacheKey(poolAddress: string, tokenAddress: string): string {
  return `${poolAddress || "-"}:${tokenAddress || "-"}`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const poolAddress = (searchParams.get("pool") || "").toLowerCase();
  const tokenAddress = (searchParams.get("token") || "").toLowerCase();

  if (!poolAddress && !tokenAddress) {
    return Response.json({ error: "Missing pool or token query param" }, { status: 400 });
  }
  if (poolAddress && !isPoolId(poolAddress)) {
    return Response.json({ error: "Invalid pool query param" }, { status: 400 });
  }
  if (tokenAddress && !isHexAddress(tokenAddress)) {
    return Response.json({ error: "Invalid token query param" }, { status: 400 });
  }

  const key = getCacheKey(poolAddress, tokenAddress);
  const now = Date.now();
  const cached = priceCache.get(key);

  if (cached && now - cached.updatedAt <= SOFT_TTL_MS) {
    return Response.json(
      { ...cached, ageMs: now - cached.updatedAt, isStale: false, isDelayed: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // Deduplicate concurrent requests for the same key
  let request = inFlight.get(key);
  if (!request) {
    request = fetchBestLivePrice(poolAddress, tokenAddress).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, request);
  }

  const latest = await request;
  if (latest) priceCache.set(key, latest);

  const resolved = latest ?? cached ?? null;
  if (!resolved) {
    return Response.json({ error: "Unable to fetch live price" }, { status: 503 });
  }

  const ageMs = now - resolved.updatedAt;
  return Response.json(
    { ...resolved, ageMs, isStale: ageMs > SOFT_TTL_MS, isDelayed: ageMs > DELAYED_AFTER_MS },
    { headers: { "Cache-Control": "no-store" } },
  );
}
