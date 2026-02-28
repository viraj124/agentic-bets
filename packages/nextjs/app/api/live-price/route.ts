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

const priceCache = new Map<string, LivePriceSnapshot>();
const inFlight = new Map<string, Promise<LivePriceSnapshot | null>>();

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

function extractAddressFromGeckoId(id: string): string {
  if (!id) return "";
  for (const part of id.split("_")) {
    const lower = part.toLowerCase();
    if (isPoolId(lower)) return lower;
  }
  return "";
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    // Optional: allow a paid CoinGecko key if present.
    if (process.env.COINGECKO_API_KEY) {
      headers["x-cg-pro-api-key"] = process.env.COINGECKO_API_KEY;
    }

    const res = await fetch(url, {
      signal: controller.signal,
      headers,
      next: { revalidate: 0 },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const json = (await res.json()) as any;
    if (toNumber(json?.status?.error_code) > 0) return null;
    return json as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchGeckoPoolPrice(poolAddress: string, tokenAddress?: string): Promise<LivePriceSnapshot | null> {
  if (!poolAddress || !isPoolId(poolAddress)) return null;

  const json = await fetchJson<GeckoPoolResponse>(`${GECKO_BASE_URL}/${poolAddress}`);
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

  const json = await fetchJson<GeckoTokenPoolsResponse>(`${GECKO_TOKENS_URL}/${tokenAddress}/pools`);
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

  const json = await fetchJson<DexTokenResponse>(`${DEXSCREENER_TOKENS_URL}/${tokenAddress}`);
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

async function fetchBestLivePrice(poolAddress: string, tokenAddress: string): Promise<LivePriceSnapshot | null> {
  const providers: Array<() => Promise<LivePriceSnapshot | null>> = [];

  if (poolAddress) {
    providers.push(() => fetchGeckoPoolPrice(poolAddress, tokenAddress || undefined));
  }
  if (tokenAddress) {
    providers.push(() => fetchDexScreenerPrice(tokenAddress, poolAddress || undefined));
    providers.push(() => fetchGeckoTokenPoolsPrice(tokenAddress, poolAddress || undefined));
  }

  for (const provider of providers) {
    const snapshot = await provider();
    if (snapshot && snapshot.priceUsd > 0) {
      return snapshot;
    }
  }
  return null;
}

function getCacheKey(poolAddress: string, tokenAddress: string): string {
  return `${poolAddress || "-"}:${tokenAddress || "-"}`;
}

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
      {
        ...cached,
        ageMs: now - cached.updatedAt,
        isStale: false,
        isDelayed: false,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  let request = inFlight.get(key);
  if (!request) {
    request = fetchBestLivePrice(poolAddress, tokenAddress).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, request);
  }

  const latest = await request;
  if (latest) {
    priceCache.set(key, latest);
  }

  const resolved = latest ?? cached ?? null;
  if (!resolved) {
    return Response.json({ error: "Unable to fetch live price" }, { status: 503 });
  }

  const ageMs = now - resolved.updatedAt;
  return Response.json(
    {
      ...resolved,
      ageMs,
      isStale: ageMs > SOFT_TTL_MS,
      isDelayed: ageMs > DELAYED_AFTER_MS,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
