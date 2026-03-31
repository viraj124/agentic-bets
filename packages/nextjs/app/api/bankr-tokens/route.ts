import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem";
import {
  DEFAULT_FALLBACK_HOOK,
  NATIVE_ETH,
  REQUIRED_TICK_SPACING,
  SUPPORTED_BANKR_V4_HOOK_CONFIGS,
  WETH_BASE,
} from "~~/lib/bankrPoolConstants";

// Allow up to 60s for cold-cache builds (Vercel serverless default is 10s)
export const maxDuration = 60;

// ── Config ───────────────────────────────────────────────────────────

const CLANKER_API = "https://www.clanker.world/api/tokens";
const CLANKER_PAGE_SIZE = 20;
const CLANKER_MAX_PAGES = 80; // safety cap, cursor-based pagination

const BANKR_INDEXER_API = "https://bankr-walletindexer-production.up.railway.app";
const BANKR_PAGE_SIZE = 200; // max allowed by indexer
const BANKR_MAX_TOKENS = 25_000; // safety cap in case indexer reports unusually large totals

const DEX_TOKENS_ENDPOINT = "https://api.dexscreener.com/tokens/v1/base";
const DEX_BATCH = 30; // endpoint max
const DEX_CONCURRENCY = 1; // sequential to avoid DexScreener 429 rate limits
const DEX_DELAY_MS = 500; // pause between waves to stay under rate limit
const DEX_MAX_RETRIES = 3;

const GECKO_BASE = "https://api.geckoterminal.com/api/v2/networks/base";
const GECKO_TOKENS_ENDPOINT = `${GECKO_BASE}/tokens/multi`;
const GECKO_BATCH = 30;
const GECKO_CONCURRENCY = 1; // strict to avoid rate limit
const GECKO_DELAY_MS = 1500; // generous gap — free tier allows ~30 req/min
const GECKO_MAX_RETRIES = 1; // don't hammer on 429
const GECKO_FALLBACK_MAX_ADDRESSES = 300; // top tokens only — keeps total batches ≤ 10

const CACHE_TTL_MS = 5 * 60_000; // serve stale cache immediately and refresh in background
const FETCH_TIMEOUT_MS = 12_000;
const SNAPSHOT_PATH = "/tmp/bankr-tokens-cache-v1.json";
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60_000;

const BOOTSTRAP_CLANKER_MAX_PAGES = 15;
const BOOTSTRAP_INDEXER_MAX_TOKENS = 2_000;

const WETH = WETH_BASE;

// ── Types ────────────────────────────────────────────────────────────

export interface PoolKeyData {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
}

export interface TokenPoolInfo {
  address: string;
  poolId: string;
  poolKey: PoolKeyData | null;
  fromClanker: boolean;
  fromIndexer: boolean;
  /** Price data embedded directly from the Clanker API — skips DexScreener/Gecko when present. */
  clankerPriceData?: PriceEnrichment;
}

export interface EnrichedToken {
  address: string;
  poolId: string;
  poolKey: PoolKeyData;
  name: string;
  symbol: string;
  imgUrl: string;
  priceUsd: number;
  marketCap: number;
  volume24h: number;
  change1h: number;
  change24h: number;
  topPoolAddress: string;
  deployedAt: string;
  pair: string;
  priceSource?: "dexscreener" | "geckoterminal";
  poolKeyVerified?: boolean;
}

interface RefreshStats {
  mode: "bootstrap" | "full";
  clankerRaw: number;
  bankrRaw: number;
  totalRaw: number;
  uniqueRaw: number;
  withPoolKey: number;
  withoutPoolKey: number;
  geckoFallbackCandidates: number;
  clankerPriced: number;
  dexPriced: number;
  geckoPriced: number;
  finalCount: number;
  refreshedAt: string;
  durationMs: number;
}

type PriceEnrichment = Omit<EnrichedToken, "address" | "poolId" | "poolKey">;

interface ClankerToken {
  contract_address: string;
  pool_address: string;
  pool_config?: { pairedToken?: string };
  name?: string;
  symbol?: string;
  img_url?: string;
  pair?: string;
  deployed_at?: string;
  priceUsd?: number;
  related?: {
    market?: {
      marketCap?: number;
      volume24h?: number;
      priceUsd?: number;
      priceChangePercent1h?: number;
      priceChangePercent24h?: number;
    };
  };
}

interface ClankerResponse {
  data?: ClankerToken[];
  cursor?: string;
}

interface BankrCoin {
  coinAddress: string;
  poolId: string;
}

interface BankrStats {
  totalCoins?: number;
}

interface DexPair {
  pairAddress?: string;
  pairCreatedAt?: number | string;
  priceUsd?: number | string;
  fdv?: number | string;
  marketCap?: number | string;
  volume?: { h24?: number | string };
  priceChange?: { h1?: number | string; h24?: number | string };
  liquidity?: { usd?: number | string };
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { symbol?: string };
  info?: { imageUrl?: string };
}

interface GeckoPool {
  address: string;
  change1h: number;
  change24h: number;
  createdAt: string;
  poolName: string;
}

interface SnapshotPayload {
  updatedAt: number;
  tokens: EnrichedToken[];
  stats: RefreshStats | null;
}

type RefreshMode = "bootstrap" | "full";

// ── Cache ────────────────────────────────────────────────────────────

const cache = {
  enrichedTokens: [] as EnrichedToken[],
  poolKeyMap: new Map<string, PoolKeyData>(),
  updatedAt: 0,
  refreshInFlight: null as Promise<void> | null,
  lastError: null as string | null,
  lastStats: null as RefreshStats | null,
  snapshotLoaded: false,
};

// ── Utils ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Circuit breaker: tracks per-host 429 cooldowns so we stop hammering rate-limited APIs
const rateLimitCooldowns = new Map<string, number>(); // hostname → resume-after timestamp
const RATE_LIMIT_COOLDOWN_MS = 60_000; // back off for 60s after a 429

async function fetchJson<T>(url: string, retries: number): Promise<T | null> {
  const hostname = new URL(url).hostname;

  // Check circuit breaker — skip entirely if host is in cooldown
  const cooldownUntil = rateLimitCooldowns.get(hostname) ?? 0;
  if (Date.now() < cooldownUntil) {
    return null;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (res.status === 429) {
        // Trip circuit breaker — stop all requests to this host for the cooldown period
        const retryAfter = Math.max(toNumber(res.headers.get("retry-after")) * 1000, RATE_LIMIT_COOLDOWN_MS);
        rateLimitCooldowns.set(hostname, Date.now() + retryAfter);
        console.warn(`[bankr-tokens] 429 from ${hostname}, circuit breaker tripped for ${retryAfter}ms`);
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      if (attempt === retries) {
        console.warn(
          `[bankr-tokens] fetch failed for ${url.slice(0, 80)}: ${err instanceof Error ? err.message : "unknown"}`,
        );
        return null;
      }
      await sleep(500 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

// ── Pool key resolution ─────────────────────────────────────────────

/** PoolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks)) */
function computePoolId(key: PoolKeyData): string {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("address, address, uint24, int24, address"), [
      key.currency0 as `0x${string}`,
      key.currency1 as `0x${string}`,
      key.fee,
      key.tickSpacing,
      key.hooks as `0x${string}`,
    ]),
  );
}

function sortCurrencies(tokenA: string, tokenB: string): [string, string] {
  return tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];
}

/** Fallback PoolKey for tokens whose pool config couldn't be verified against known hooks. */
function deriveFallbackPoolKey(tokenAddress: string): PoolKeyData {
  const [c0, c1] = sortCurrencies(tokenAddress, WETH);
  return {
    currency0: c0,
    currency1: c1,
    fee: SUPPORTED_BANKR_V4_HOOK_CONFIGS[0].fee, // CLANKER_DYNAMIC_FEE_FLAG
    tickSpacing: REQUIRED_TICK_SPACING,
    hooks: DEFAULT_FALLBACK_HOOK,
  };
}

/** Match an expected PoolId against known V4 hook configurations.
 *  Tries both the provided pairedToken AND native ETH (address(0)) as quote,
 *  since vanilla V4 pools use native ETH instead of WETH. */
function resolvePoolKey(tokenAddress: string, pairedToken: string, expectedPoolId: string): PoolKeyData | null {
  if (!isHexBytes32(expectedPoolId)) return null;

  // Try the provided quote token first, then native ETH if different
  const quoteTokens = [pairedToken];
  if (pairedToken.toLowerCase() !== NATIVE_ETH.toLowerCase()) {
    quoteTokens.push(NATIVE_ETH);
  }

  for (const quote of quoteTokens) {
    const [c0, c1] = sortCurrencies(tokenAddress, quote);
    for (const hook of SUPPORTED_BANKR_V4_HOOK_CONFIGS) {
      const key: PoolKeyData = {
        currency0: c0,
        currency1: c1,
        fee: hook.fee,
        tickSpacing: REQUIRED_TICK_SPACING,
        hooks: hook.address,
      };
      if (computePoolId(key).toLowerCase() === expectedPoolId.toLowerCase()) {
        return key;
      }
    }
  }
  return null;
}

// ── Data sources ─────────────────────────────────────────────────────

async function fetchFromClanker(maxPages = CLANKER_MAX_PAGES): Promise<TokenPoolInfo[]> {
  const tokens: TokenPoolInfo[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(CLANKER_API);
    url.searchParams.set("socialInterface", "Bankr");
    url.searchParams.set("chainId", "8453");
    url.searchParams.set("limit", String(CLANKER_PAGE_SIZE));
    url.searchParams.set("sortBy", "market-cap");
    url.searchParams.set("sort", "desc");
    if (cursor) url.searchParams.set("cursor", cursor);

    const json = await fetchJson<ClankerResponse>(url.toString(), 2);
    const items = Array.isArray(json?.data) ? json.data : [];
    if (items.length === 0) break;

    for (const item of items) {
      const addr = (item.contract_address || "").toLowerCase();
      if (!isHexAddress(addr) || seen.has(addr)) continue;
      seen.add(addr);

      const poolRef = (item.pool_address || "").toLowerCase();
      const pairedToken = (item.pool_config?.pairedToken || WETH).toLowerCase();
      const poolKey = resolvePoolKey(addr, pairedToken, poolRef);

      // Extract embedded price data from Clanker API to avoid DexScreener/Gecko dependency
      const clankerPrice = toNumber(item.priceUsd) || toNumber(item.related?.market?.priceUsd);
      const clankerPriceData: PriceEnrichment | undefined =
        clankerPrice > 0
          ? {
              name: item.name || "",
              symbol: item.symbol || "",
              imgUrl: item.img_url || "",
              priceUsd: clankerPrice,
              marketCap: toNumber(item.related?.market?.marketCap),
              volume24h: toNumber(item.related?.market?.volume24h),
              change1h: toNumber(item.related?.market?.priceChangePercent1h),
              change24h: toNumber(item.related?.market?.priceChangePercent24h),
              topPoolAddress: "",
              deployedAt: item.deployed_at || "",
              pair: item.pair || "WETH",
              priceSource: "dexscreener",
              poolKeyVerified: true,
            }
          : undefined;

      tokens.push({
        address: addr,
        poolId: poolKey ? computePoolId(poolKey) : poolRef,
        poolKey,
        fromClanker: true,
        fromIndexer: false,
        clankerPriceData,
      });
    }

    const nextCursor = json?.cursor || null;
    if (!nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }

  return tokens;
}

async function fetchFromBankrIndexer(maxTokens = BANKR_MAX_TOKENS): Promise<TokenPoolInfo[]> {
  const tokens: TokenPoolInfo[] = [];
  const seen = new Set<string>();

  const stats = await fetchJson<BankrStats>(`${BANKR_INDEXER_API}/stats`, 2);
  const reportedTotal = Math.max(0, toNumber(stats?.totalCoins));
  const cappedTotal = Math.min(reportedTotal || maxTokens, maxTokens);
  const maxPages = Math.max(1, Math.ceil(cappedTotal / BANKR_PAGE_SIZE));

  for (let page = 0; page < maxPages; page++) {
    const offset = page * BANKR_PAGE_SIZE;
    const items = await fetchJson<BankrCoin[]>(
      `${BANKR_INDEXER_API}/coins?limit=${BANKR_PAGE_SIZE}&offset=${offset}`,
      2,
    );
    if (!Array.isArray(items) || items.length === 0) break;

    for (const item of items) {
      const addr = (item.coinAddress || "").toLowerCase();
      if (!isHexAddress(addr) || seen.has(addr)) continue;
      seen.add(addr);

      const poolId = (item.poolId || "").toLowerCase();
      const poolKey = resolvePoolKey(addr, WETH, poolId);

      tokens.push({
        address: addr,
        poolId: poolKey ? computePoolId(poolKey) : poolId,
        poolKey,
        fromClanker: false,
        fromIndexer: true,
      });
    }

    if (items.length < BANKR_PAGE_SIZE) break;
  }

  return tokens;
}

// ── Price enrichment ─────────────────────────────────────────────────

async function fetchDexBatch(chunkAddresses: string[]): Promise<Map<string, PriceEnrichment>> {
  const out = new Map<string, PriceEnrichment>();
  if (chunkAddresses.length === 0) return out;

  const pairs = await fetchJson<DexPair[]>(`${DEX_TOKENS_ENDPOINT}/${chunkAddresses.join(",")}`, DEX_MAX_RETRIES);
  if (!Array.isArray(pairs) || pairs.length === 0) return out;

  const bestByAddress = new Map<string, { pair: DexPair; score: number }>();
  for (const pair of pairs) {
    const addr = (pair.baseToken?.address || "").toLowerCase();
    const priceUsd = toNumber(pair.priceUsd);
    if (!isHexAddress(addr) || priceUsd <= 0) continue;

    const liquidityUsd = toNumber(pair.liquidity?.usd);
    const volume24h = toNumber(pair.volume?.h24);
    const marketCap = toNumber(pair.marketCap) || toNumber(pair.fdv);
    const score = liquidityUsd * 1_000 + volume24h * 10 + marketCap;

    const prev = bestByAddress.get(addr);
    if (!prev || score > prev.score) {
      bestByAddress.set(addr, { pair, score });
    }
  }

  for (const [addr, entry] of bestByAddress) {
    const pair = entry.pair;
    const createdAtMs = toNumber(pair.pairCreatedAt);
    const deployedAt = createdAtMs > 0 ? new Date(createdAtMs).toISOString() : "";

    out.set(addr, {
      name: pair.baseToken?.name || "",
      symbol: pair.baseToken?.symbol || "",
      imgUrl: pair.info?.imageUrl || "",
      priceUsd: toNumber(pair.priceUsd),
      marketCap: toNumber(pair.marketCap) || toNumber(pair.fdv),
      volume24h: toNumber(pair.volume?.h24),
      change1h: toNumber(pair.priceChange?.h1),
      change24h: toNumber(pair.priceChange?.h24),
      topPoolAddress: (pair.pairAddress || "").toLowerCase(),
      deployedAt,
      pair: pair.quoteToken?.symbol || "WETH",
      priceSource: "dexscreener",
      poolKeyVerified: true,
    });
  }

  return out;
}

/**
 * GeckoTerminal relationship IDs are formatted as "<network>_<address>", e.g. "base_0xabc...".
 * When a pool is referenced in `relationships` but not included in the `included` array
 * (pagination gap or API inconsistency), we can still recover the pool address from the ID.
 */
function extractAddressFromGeckoId(id: string): string {
  if (!id) return "";
  for (const part of id.split("_")) {
    const lower = part.toLowerCase();
    if (isHexAddress(lower) || isHexBytes32(lower)) return lower;
  }
  return "";
}

async function fetchGeckoBatch(chunkAddresses: string[]): Promise<Map<string, PriceEnrichment>> {
  const out = new Map<string, PriceEnrichment>();
  if (chunkAddresses.length === 0) return out;

  const json = await fetchJson<any>(
    `${GECKO_TOKENS_ENDPOINT}/${chunkAddresses.join(",")}?include=top_pools`,
    GECKO_MAX_RETRIES,
  );
  if (!json) return out;

  const poolMap = new Map<string, GeckoPool>();
  for (const item of json.included || []) {
    if (item?.type !== "pool") continue;
    const a = item.attributes || {};
    poolMap.set(item.id, {
      address: (a.address || "").toLowerCase(),
      change1h: toNumber(a.price_change_percentage?.h1),
      change24h: toNumber(a.price_change_percentage?.h24),
      createdAt: a.pool_created_at || "",
      poolName: a.name || "",
    });
  }

  for (const token of json.data || []) {
    const a = token.attributes || {};
    const addr = (a.address || "").toLowerCase();
    const priceUsd = toNumber(a.price_usd);
    if (!isHexAddress(addr) || priceUsd <= 0) continue;

    const topPoolRef = token.relationships?.top_pools?.data?.[0];
    const pool = topPoolRef ? poolMap.get(topPoolRef.id) : undefined;

    // Fallback: pool not in included array — extract address from the relationship ID string
    const topPoolAddress = pool?.address || (topPoolRef ? extractAddressFromGeckoId(topPoolRef.id) : "");
    const pair = pool?.poolName?.includes("USDC") ? "USDC" : "WETH";

    out.set(addr, {
      name: a.name || "",
      symbol: a.symbol || "",
      imgUrl: a.image_url || "",
      priceUsd,
      marketCap: toNumber(a.market_cap_usd) || toNumber(a.fdv_usd),
      volume24h: toNumber(a.volume_usd?.h24),
      change1h: pool?.change1h || 0,
      change24h: pool?.change24h || 0,
      topPoolAddress,
      deployedAt: pool?.createdAt || "",
      pair,
      priceSource: "geckoterminal",
      poolKeyVerified: true,
    });
  }

  return out;
}

async function enrichWithPriceData(
  tokens: TokenPoolInfo[],
  opts?: { enableGeckoFallback?: boolean; geckoFallbackMaxAddresses?: number },
): Promise<{
  enriched: EnrichedToken[];
  dexPriced: number;
  geckoPriced: number;
  geckoFallbackCandidates: number;
  clankerPriced: number;
}> {
  const eligible = tokens;
  const allAddresses = eligible.map(t => t.address);
  const clankerPricedCount = eligible.filter(t => !!t.clankerPriceData).length;
  console.log(`[bankr-tokens] Clanker API: ${clankerPricedCount} tokens have embedded price data (may be incomplete)`);

  // 1) DexScreener — fetch for ALL tokens so we can fill gaps in Clanker data (e.g. volume=0)
  const dexChunks = chunk(allAddresses, DEX_BATCH);
  const dexMap = new Map<string, PriceEnrichment>();
  const dexHost = "api.dexscreener.com";
  for (let i = 0; i < dexChunks.length; i += DEX_CONCURRENCY) {
    // Abort remaining batches if circuit breaker tripped
    if (Date.now() < (rateLimitCooldowns.get(dexHost) ?? 0)) {
      console.warn(
        `[bankr-tokens] DexScreener circuit breaker active, skipping ${dexChunks.length - i} remaining batches`,
      );
      break;
    }
    const wave = dexChunks.slice(i, i + DEX_CONCURRENCY);
    const results = await Promise.all(
      wave.map(c =>
        fetchDexBatch(c).catch(err => {
          console.warn(`[bankr-tokens] DexScreener batch failed: ${err instanceof Error ? err.message : "unknown"}`);
          return new Map();
        }),
      ),
    );
    for (const m of results) {
      for (const [addr, data] of m) dexMap.set(addr, data);
    }
    if (i + DEX_CONCURRENCY < dexChunks.length) {
      await sleep(DEX_DELAY_MS);
    }
  }
  console.log(
    `[bankr-tokens] DexScreener: ${dexMap.size} priced out of ${allAddresses.length} addresses (${dexChunks.length} batches)`,
  );

  // 2) Gecko — fetch for ALL tokens (capped) so we can pick max(volume) across sources.
  //    DexScreener often under-reports volume vs GeckoTerminal's aggregation.
  const useGeckoFallback = opts?.enableGeckoFallback ?? true;
  const geckoFallbackMaxAddresses = opts?.geckoFallbackMaxAddresses ?? GECKO_FALLBACK_MAX_ADDRESSES;
  const geckoFallbackCandidates = useGeckoFallback ? allAddresses.slice(0, geckoFallbackMaxAddresses) : [];

  const geckoChunks = chunk(geckoFallbackCandidates, GECKO_BATCH);
  const geckoMap = new Map<string, PriceEnrichment>();
  const geckoHost = "api.geckoterminal.com";
  for (let i = 0; i < geckoChunks.length; i += GECKO_CONCURRENCY) {
    // Abort remaining batches if circuit breaker tripped
    if (Date.now() < (rateLimitCooldowns.get(geckoHost) ?? 0)) {
      console.warn(
        `[bankr-tokens] GeckoTerminal circuit breaker active, skipping ${geckoChunks.length - i} remaining batches`,
      );
      break;
    }
    const wave = geckoChunks.slice(i, i + GECKO_CONCURRENCY);
    const results = await Promise.all(
      wave.map(c =>
        fetchGeckoBatch(c).catch(err => {
          console.warn(`[bankr-tokens] GeckoTerminal batch failed: ${err instanceof Error ? err.message : "unknown"}`);
          return new Map();
        }),
      ),
    );
    for (const m of results) {
      for (const [addr, data] of m) {
        geckoMap.set(addr, data);
      }
    }
    if (i + GECKO_CONCURRENCY < geckoChunks.length) {
      await sleep(GECKO_DELAY_MS);
    }
  }

  console.log(
    `[bankr-tokens] GeckoTerminal: ${geckoMap.size} priced out of ${geckoFallbackCandidates.length} candidates (${geckoChunks.length} batches)`,
  );

  const enriched: EnrichedToken[] = [];
  for (const token of eligible) {
    const clanker = token.clankerPriceData;
    const dex = dexMap.get(token.address);
    const gecko = geckoMap.get(token.address);

    // Need at least one source
    const base = dex || clanker || gecko;
    if (!base) continue;

    // Merge all sources — DexScreener for price/pool, Gecko for volume (often higher), Clanker as fallback
    const sources = [clanker, dex, gecko].filter(Boolean) as PriceEnrichment[];
    const best = (field: keyof PriceEnrichment, mode: "max" | "first" = "first"): any => {
      if (mode === "max") return Math.max(...sources.map(s => toNumber(s[field])));
      for (const s of sources) if (s[field]) return s[field];
      return base[field];
    };

    const priceData: PriceEnrichment = {
      ...base,
      name: best("name"),
      symbol: best("symbol"),
      imgUrl: best("imgUrl"),
      priceUsd: dex?.priceUsd || gecko?.priceUsd || clanker?.priceUsd || 0,
      volume24h: best("volume24h", "max"),
      marketCap: best("marketCap", "max"),
      change1h: dex?.change1h || gecko?.change1h || clanker?.change1h || 0,
      change24h: dex?.change24h || gecko?.change24h || clanker?.change24h || 0,
      topPoolAddress: best("topPoolAddress"),
      deployedAt: best("deployedAt"),
      pair: best("pair"),
    };

    const resolvedPoolKey = token.poolKey ?? deriveFallbackPoolKey(token.address);

    enriched.push({
      address: token.address,
      poolId: token.poolId || computePoolId(resolvedPoolKey),
      poolKey: resolvedPoolKey,
      ...priceData,
      poolKeyVerified: token.poolKey !== null,
    });
  }

  // Drop tokens with zero 24h volume — dead/inactive tokens clutter the list
  const active = enriched.filter(t => t.volume24h > 0);
  active.sort((a, b) => b.marketCap - a.marketCap);

  console.log(
    `[bankr-tokens] Final: ${active.length} active (${enriched.length - active.length} dropped for zero volume) (clanker: ${clankerPricedCount}, dex: ${dexMap.size}, gecko: ${geckoMap.size})`,
  );

  return {
    enriched: active,
    dexPriced: dexMap.size,
    geckoPriced: geckoMap.size,
    geckoFallbackCandidates: geckoFallbackCandidates.length,
    clankerPriced: clankerPricedCount,
  };
}

// ── Refresh pipeline ────────────────────────────────────────────────

async function loadSnapshotIntoCache(): Promise<void> {
  if (cache.snapshotLoaded) return;
  cache.snapshotLoaded = true;

  try {
    const raw = await readFile(SNAPSHOT_PATH, "utf8");
    const snapshot = JSON.parse(raw) as SnapshotPayload;
    if (!Array.isArray(snapshot?.tokens) || typeof snapshot?.updatedAt !== "number") return;
    if (Date.now() - snapshot.updatedAt > SNAPSHOT_MAX_AGE_MS) return;

    cache.enrichedTokens = snapshot.tokens;
    cache.updatedAt = snapshot.updatedAt;
    cache.lastStats = snapshot.stats || null;
    cache.poolKeyMap.clear();
    for (const token of snapshot.tokens) {
      if (token.poolKey) cache.poolKeyMap.set(token.address.toLowerCase(), token.poolKey);
    }
  } catch {
    // snapshot optional; ignore read/parse failures
  }
}

async function persistSnapshot(): Promise<void> {
  try {
    const payload: SnapshotPayload = {
      updatedAt: cache.updatedAt,
      tokens: cache.enrichedTokens,
      stats: cache.lastStats,
    };
    await writeFile(SNAPSHOT_PATH, JSON.stringify(payload), "utf8");
  } catch {
    // snapshot is best-effort only
  }
}

async function rebuildCache(mode: RefreshMode): Promise<void> {
  const startedAt = Date.now();
  const clankerPageLimit = mode === "full" ? CLANKER_MAX_PAGES : BOOTSTRAP_CLANKER_MAX_PAGES;
  const indexerTokenLimit = mode === "full" ? BANKR_MAX_TOKENS : BOOTSTRAP_INDEXER_MAX_TOKENS;
  const geckoEnabled = true; // always enable Gecko fallback since DexScreener rate-limits aggressively

  const [clankerTokens, bankrTokens] = await Promise.all([
    fetchFromClanker(clankerPageLimit).catch(err => {
      console.warn(`[bankr-tokens] Clanker fetch failed: ${err instanceof Error ? err.message : "unknown"}`);
      return [] as TokenPoolInfo[];
    }),
    fetchFromBankrIndexer(indexerTokenLimit).catch(err => {
      console.warn(`[bankr-tokens] Bankr indexer fetch failed: ${err instanceof Error ? err.message : "unknown"}`);
      return [] as TokenPoolInfo[];
    }),
  ]);
  console.log(`[bankr-tokens] Sources: ${clankerTokens.length} clanker, ${bankrTokens.length} indexer (mode=${mode})`);

  const allRaw = [...clankerTokens, ...bankrTokens];
  const tokenMap = new Map<string, TokenPoolInfo>();

  for (const token of allRaw) {
    const existing = tokenMap.get(token.address);
    if (!existing) {
      tokenMap.set(token.address, { ...token });
      continue;
    }

    existing.fromClanker = existing.fromClanker || token.fromClanker;
    existing.fromIndexer = existing.fromIndexer || token.fromIndexer;

    // Prefer the entry with a resolved/verified PoolKey.
    if (!existing.poolKey && token.poolKey) {
      existing.poolKey = token.poolKey;
      existing.poolId = token.poolId;
    }
    // Preserve Clanker embedded price data
    if (!existing.clankerPriceData && token.clankerPriceData) {
      existing.clankerPriceData = token.clankerPriceData;
    }
  }

  const uniqueTokens = [...tokenMap.values()];
  const withPoolKey = uniqueTokens.filter(t => !!t.poolKey);
  const withoutPoolKey = uniqueTokens.length - withPoolKey.length;

  // ── Fast bootstrap: use only clanker embedded price data, skip DexScreener/Gecko ──
  // This returns results in ~2-3s instead of 30-60s on cold start.
  // Full enrichment with DexScreener/Gecko runs in the background after bootstrap.
  let enriched: EnrichedToken[];
  let dexPriced: number;
  let geckoPriced: number;
  let geckoFallbackCandidates: number;
  let clankerPriced: number;

  if (mode === "bootstrap") {
    // Bootstrap: use Clanker for token list + DexScreener for global market data (skip slow Gecko).
    // DexScreener enrichment for all tokens takes ~5-8s (vs 30-60s with Gecko included).
    const result = await enrichWithPriceData(uniqueTokens, {
      enableGeckoFallback: false,
      geckoFallbackMaxAddresses: 0,
    });
    enriched = result.enriched;
    dexPriced = result.dexPriced;
    geckoPriced = 0;
    geckoFallbackCandidates = 0;
    clankerPriced = result.clankerPriced;
    console.log(`[bankr-tokens] Bootstrap: ${enriched.length} tokens enriched via DexScreener (Gecko skipped)`);
  } else {
    const result = await enrichWithPriceData(uniqueTokens, {
      enableGeckoFallback: geckoEnabled,
      geckoFallbackMaxAddresses: geckoEnabled ? GECKO_FALLBACK_MAX_ADDRESSES : 0,
    });
    enriched = result.enriched;
    dexPriced = result.dexPriced;
    geckoPriced = result.geckoPriced;
    geckoFallbackCandidates = result.geckoFallbackCandidates;
    clankerPriced = result.clankerPriced;
  }

  // Replace BNKRW with WCHAN (WalletChan) — Bankr rebranded to WalletChan
  // WCHAN uses a vanilla V4 pool: native ETH + no hooks + fee=10000
  const BNKRW_ADDRESS = "0xf48bc234855ab08ab2ec0cfaaeb2a80d065a3b07";
  const WCHAN_ADDRESS = "0xba5ed0000e1ca9136a695f0a848012a16008b032";
  const WCHAN_POOL_ID = "0x81c7a2a2c33ea285f062c5ac0c4e3d4ffb2f6fd2588bbd354d0d3af8a58b6337";
  const bnkrwIdx = enriched.findIndex(t => t.address === BNKRW_ADDRESS);
  if (bnkrwIdx !== -1) {
    const wchanPrice = await fetchDexBatch([WCHAN_ADDRESS]).catch(() => new Map());
    const wchanData = wchanPrice.get(WCHAN_ADDRESS);
    if (wchanData) {
      // Resolve WCHAN's actual pool key (native ETH, no hooks, fee=10000)
      const wchanPoolKey = resolvePoolKey(WCHAN_ADDRESS, WETH, WCHAN_POOL_ID);
      const poolKey = wchanPoolKey ?? deriveFallbackPoolKey(WCHAN_ADDRESS);
      const verified = wchanPoolKey !== null;
      // Use topPoolAddress (DexScreener pair) as poolId so charts resolve correctly
      const realPoolAddress = wchanData.topPoolAddress || "";
      enriched[bnkrwIdx] = {
        address: WCHAN_ADDRESS,
        poolId: realPoolAddress || WCHAN_POOL_ID,
        poolKey,
        ...wchanData,
        poolKeyVerified: verified,
      };
    } else {
      // No price data for WCHAN — just remove BNKRW
      enriched.splice(bnkrwIdx, 1);
    }
  }

  cache.poolKeyMap.clear();
  for (const token of withPoolKey) {
    if (token.poolKey) cache.poolKeyMap.set(token.address, token.poolKey);
  }
  cache.enrichedTokens = enriched;
  cache.updatedAt = Date.now();
  cache.lastError = null;
  cache.lastStats = {
    mode,
    clankerRaw: clankerTokens.length,
    bankrRaw: bankrTokens.length,
    totalRaw: allRaw.length,
    uniqueRaw: uniqueTokens.length,
    withPoolKey: withPoolKey.length,
    withoutPoolKey,
    geckoFallbackCandidates,
    clankerPriced,
    dexPriced,
    geckoPriced,
    finalCount: enriched.length,
    refreshedAt: new Date(cache.updatedAt).toISOString(),
    durationMs: Date.now() - startedAt,
  };

  await persistSnapshot();
}

function triggerRefresh(mode: RefreshMode): Promise<void> {
  if (cache.refreshInFlight) return cache.refreshInFlight;

  cache.refreshInFlight = rebuildCache(mode)
    .catch(err => {
      cache.lastError = err instanceof Error ? err.message : "Failed to refresh token cache";
    })
    .finally(() => {
      cache.refreshInFlight = null;
    });

  return cache.refreshInFlight;
}

// ── Route handler ────────────────────────────────────────────────────

export async function GET(req: Request) {
  await loadSnapshotIntoCache();

  const url = new URL(req.url);
  const includeDebug = url.searchParams.get("debug") === "1";
  const forceRefresh = url.searchParams.get("refresh") === "1";

  const hasCache = cache.enrichedTokens.length > 0;
  const isFresh = hasCache && Date.now() - cache.updatedAt < CACHE_TTL_MS;

  // Cold start: run a fast bootstrap refresh once, then promote to full refresh in background.
  if (!hasCache) {
    await triggerRefresh("bootstrap");
    if (cache.enrichedTokens.length > 0) {
      void triggerRefresh("full");
    } else {
      await triggerRefresh("full");
    }
  } else if (forceRefresh || !isFresh) {
    void triggerRefresh("full");
  }

  const payload: Record<string, unknown> = {
    tokens: cache.enrichedTokens,
    count: cache.enrichedTokens.length,
    updatedAt: cache.updatedAt,
  };

  if (includeDebug) {
    payload.debug = {
      ...(cache.lastStats || {}),
      isRefreshing: !!cache.refreshInFlight,
      cacheAgeMs: cache.updatedAt ? Date.now() - cache.updatedAt : null,
      lastError: cache.lastError,
    };
  }

  return NextResponse.json(payload);
}
