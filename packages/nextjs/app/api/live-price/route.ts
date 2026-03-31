import { NextRequest } from "next/server";

export const maxDuration = 15;

type LivePriceSnapshot = {
  priceUsd: number;
  source: "gecko-pool" | "dexscreener-token" | "gecko-token-pools" | "zerox-price" | "uniswap-trading";
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

type ZeroXPriceResponse = {
  price?: string | number;
  buyAmount?: string | number;
  sellAmount?: string | number;
  liquidityAvailable?: boolean;
};

type UniswapQuoteResponse = {
  routing?: string;
  quote?: {
    input?: { token?: string; amount?: string | number };
    output?: { token?: string; amount?: string | number };
    gasFeeUSD?: string | number;
  };
};

const GECKO_BASE_URL = "https://api.geckoterminal.com/api/v2/networks/base/pools";
const GECKO_TOKENS_URL = "https://api.geckoterminal.com/api/v2/networks/base/tokens";
const DEXSCREENER_TOKENS_URL = "https://api.dexscreener.com/latest/dex/tokens";
const ZEROX_BASE_URL = "https://api.0x.org";
const ZEROX_CHAIN_ID = "8453"; // Base mainnet
const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const WETH_BASE = "0x4200000000000000000000000000000000000006";
const BANKR_SELL_AMOUNT_18_DECIMALS = "1000000000000000000"; // 1 token @ 18 decimals
const UNISWAP_TRADING_API_URL = "https://trade-api.gateway.uniswap.org/v1/quote";
const UNISWAP_BASE_CHAIN_ID = 8453;

const FETCH_TIMEOUT_MS = 5000;
const SOFT_TTL_MS = 8000;
const DELAYED_AFTER_MS = 15000;
const PROVIDER_COOLDOWN_MS = 45_000; // skip a provider for 45s after a 429
const USDC_DECIMALS = 6;
const OX_API_KEY = process.env["0X_API_KEY"] ?? "";
const UNISWAP_API_KEY = process.env.UNISWAP_API_KEY ?? "";

const priceCache = new Map<string, LivePriceSnapshot>();
const inFlight = new Map<string, Promise<LivePriceSnapshot | null>>();
// Per-provider 429 cooldown: "gecko" | "dexscreener" | "zerox" | "uniswap" → timestamp until available
const rateLimitedUntil = new Map<string, number>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toPositiveBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value > 0n ? value : 0n;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return 0n;
    return BigInt(Math.floor(value));
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const n = BigInt(value);
    return n > 0n ? n : 0n;
  }
  return 0n;
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
async function fetchRaw(url: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
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

/**
 * Walletchan-style 0x price lookup (Swap API v2 allowance-holder endpoint).
 *
 * This route is an additional fallback only. We quote TOKEN -> USDC for 1 token
 * using 18 decimals, which matches Bankr/Clanker token defaults.
 */
async function fetchZeroXPrice(tokenAddress: string): Promise<LivePriceSnapshot | null> {
  if (!tokenAddress || !isHexAddress(tokenAddress)) return null;
  if (!OX_API_KEY) return null;
  if (isRateLimited("zerox")) return null;

  const params = new URLSearchParams({
    chainId: ZEROX_CHAIN_ID,
    sellToken: tokenAddress,
    buyToken: USDC_BASE,
    sellAmount: BANKR_SELL_AMOUNT_18_DECIMALS,
  });

  const res = await fetchRaw(`${ZEROX_BASE_URL}/swap/allowance-holder/price?${params.toString()}`, {
    headers: {
      "0x-api-key": OX_API_KEY,
      "0x-version": "v2",
    },
  });
  if (!res) return null;
  if (res.status === 429) {
    markRateLimited("zerox");
    return null;
  }
  if (!res.ok) return null;

  const json = (await res.json()) as ZeroXPriceResponse;
  if (json.liquidityAvailable === false) return null;

  const directPriceUsd = toNumber(json.price);
  if (directPriceUsd > 0) {
    return {
      priceUsd: directPriceUsd,
      source: "zerox-price",
      updatedAt: Date.now(),
      tokenAddress,
    };
  }

  const buyAmountRaw = toPositiveBigInt(json.buyAmount);
  const sellAmountRaw = toPositiveBigInt(json.sellAmount || BANKR_SELL_AMOUNT_18_DECIMALS);
  if (!(buyAmountRaw > 0n) || !(sellAmountRaw > 0n)) return null;

  const normalizedSell = Number(sellAmountRaw) / 10 ** 18;
  const normalizedBuyUsdc = Number(buyAmountRaw) / 10 ** USDC_DECIMALS;
  const priceUsd = normalizedBuyUsdc / normalizedSell;
  if (!(priceUsd > 0)) return null;

  return {
    priceUsd,
    source: "zerox-price",
    updatedAt: Date.now(),
    tokenAddress,
  };
}

/**
 * Uniswap Trading API quote: TOKEN → USDC on Base.
 *
 * Uses a dead-address swapper since we only need an indicative quote, not an
 * executable transaction.  The API still returns accurate routing & pricing.
 */
async function fetchUniswapTradingPrice(tokenAddress: string): Promise<LivePriceSnapshot | null> {
  if (!tokenAddress || !isHexAddress(tokenAddress)) return null;
  if (!UNISWAP_API_KEY) return null;
  if (isRateLimited("uniswap")) return null;

  // Skip if the token IS USDC or WETH (no meaningful self-quote)
  if (tokenAddress === USDC_BASE || tokenAddress === WETH_BASE) return null;

  const body = JSON.stringify({
    type: "EXACT_INPUT",
    amount: BANKR_SELL_AMOUNT_18_DECIMALS, // 1 token (18 decimals)
    tokenInChainId: UNISWAP_BASE_CHAIN_ID,
    tokenOutChainId: UNISWAP_BASE_CHAIN_ID,
    tokenIn: tokenAddress,
    tokenOut: USDC_BASE,
    swapper: "0x0000000000000000000000000000000000000001",
    slippageTolerance: 0.5,
    protocols: ["V2", "V3", "V4"],
  });

  const res = await fetchRaw(UNISWAP_TRADING_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": UNISWAP_API_KEY,
    },
    body,
  });

  if (!res) return null;
  if (res.status === 429) {
    markRateLimited("uniswap");
    return null;
  }
  if (!res.ok) return null;

  const json = (await res.json()) as UniswapQuoteResponse;

  const outputAmount = toPositiveBigInt(json?.quote?.output?.amount);
  const inputAmount = toPositiveBigInt(json?.quote?.input?.amount || BANKR_SELL_AMOUNT_18_DECIMALS);
  if (!(outputAmount > 0n) || !(inputAmount > 0n)) return null;

  // output is USDC (6 decimals), input is the token (18 decimals)
  const normalizedInput = Number(inputAmount) / 1e18;
  const normalizedOutputUsdc = Number(outputAmount) / 10 ** USDC_DECIMALS;
  const priceUsd = normalizedOutputUsdc / normalizedInput;
  if (!(priceUsd > 0)) return null;

  return {
    priceUsd,
    source: "uniswap-trading",
    updatedAt: Date.now(),
    tokenAddress,
  };
}

// ── Provider cascade ──────────────────────────────────────────────────────────

/**
 * Fetch the best available live price using a resilient provider cascade.
 *
 * When GeckoTerminal is healthy: Gecko Pool → DexScreener → 0x → Uniswap Trading API → Gecko Token Pools
 * When GeckoTerminal is rate-limited: DexScreener → 0x → Uniswap → (then Gecko if cooldown clears)
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
    // 0x quote endpoint covers many routable pools and helps during Gecko/Dex outages.
    providers.push(() => fetchZeroXPrice(tokenAddress));
  }

  if (tokenAddress) {
    // Uniswap Trading API: V2/V3/V4 routing quote — accurate pricing via their aggregator.
    providers.push(() => fetchUniswapTradingPrice(tokenAddress));
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
      { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15" } },
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
    { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15" } },
  );
}
