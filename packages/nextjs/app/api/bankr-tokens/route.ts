import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem";
import { REQUIRED_TICK_SPACING, SUPPORTED_BANKR_V4_HOOK_CONFIGS, WETH_BASE } from "~~/lib/bankrPoolConstants";

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
const DEX_CONCURRENCY = 12;
const DEX_MAX_RETRIES = 3;

const GECKO_BASE = "https://api.geckoterminal.com/api/v2/networks/base";
const GECKO_TOKENS_ENDPOINT = `${GECKO_BASE}/tokens/multi`;
const GECKO_BATCH = 30;
const GECKO_CONCURRENCY = 1; // strict to avoid rate limit
const GECKO_DELAY_MS = 250;
const GECKO_MAX_RETRIES = 2;
const GECKO_FALLBACK_MAX_ADDRESSES = 1_200; // avoid very large fallback scans

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

async function fetchJson<T>(url: string, retries: number): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch {
      if (attempt === retries) return null;
      await sleep(150 * (attempt + 1));
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

/** Match an expected PoolId against known V4 hook configurations. */
function resolvePoolKey(tokenAddress: string, pairedToken: string, expectedPoolId: string): PoolKeyData | null {
  if (!isHexBytes32(expectedPoolId)) return null;
  const [c0, c1] = sortCurrencies(tokenAddress, pairedToken);

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

      tokens.push({
        address: addr,
        poolId: poolKey ? computePoolId(poolKey) : poolRef,
        poolKey,
        fromClanker: true,
        fromIndexer: false,
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
      topPoolAddress: pool?.address || "",
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
}> {
  const eligible = tokens.filter(t => !!t.poolKey);
  const addresses = eligible.map(t => t.address);

  // 1) DexScreener primary coverage
  const dexChunks = chunk(addresses, DEX_BATCH);
  const dexMap = new Map<string, PriceEnrichment>();
  for (let i = 0; i < dexChunks.length; i += DEX_CONCURRENCY) {
    const wave = dexChunks.slice(i, i + DEX_CONCURRENCY);
    const results = await Promise.all(wave.map(c => fetchDexBatch(c).catch(() => new Map())));
    for (const m of results) {
      for (const [addr, data] of m) dexMap.set(addr, data);
    }
  }

  // 2) Gecko fallback only for Clanker-source tokens Dex didn't price
  const useGeckoFallback = opts?.enableGeckoFallback ?? true;
  const geckoFallbackMaxAddresses = opts?.geckoFallbackMaxAddresses ?? GECKO_FALLBACK_MAX_ADDRESSES;
  const geckoFallbackCandidates = useGeckoFallback
    ? Array.from(new Set(eligible.filter(t => t.fromClanker && !dexMap.has(t.address)).map(t => t.address))).slice(
        0,
        geckoFallbackMaxAddresses,
      )
    : [];

  const geckoChunks = chunk(geckoFallbackCandidates, GECKO_BATCH);
  const geckoMap = new Map<string, PriceEnrichment>();
  for (let i = 0; i < geckoChunks.length; i += GECKO_CONCURRENCY) {
    const wave = geckoChunks.slice(i, i + GECKO_CONCURRENCY);
    const results = await Promise.all(wave.map(c => fetchGeckoBatch(c).catch(() => new Map())));
    for (const m of results) {
      for (const [addr, data] of m) {
        if (!dexMap.has(addr)) geckoMap.set(addr, data);
      }
    }
    if (i + GECKO_CONCURRENCY < geckoChunks.length) {
      await sleep(GECKO_DELAY_MS);
    }
  }

  const enriched: EnrichedToken[] = [];
  for (const token of eligible) {
    const priceData = dexMap.get(token.address) || geckoMap.get(token.address);
    if (!priceData || !token.poolKey) continue;

    enriched.push({
      address: token.address,
      poolId: token.poolId,
      poolKey: token.poolKey,
      ...priceData,
    });
  }

  enriched.sort((a, b) => b.marketCap - a.marketCap);

  return {
    enriched,
    dexPriced: dexMap.size,
    geckoPriced: geckoMap.size,
    geckoFallbackCandidates: geckoFallbackCandidates.length,
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
  const geckoEnabled = mode === "full";

  const [clankerTokens, bankrTokens] = await Promise.all([
    fetchFromClanker(clankerPageLimit).catch(() => [] as TokenPoolInfo[]),
    fetchFromBankrIndexer(indexerTokenLimit).catch(() => [] as TokenPoolInfo[]),
  ]);

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
  }

  const uniqueTokens = [...tokenMap.values()];
  const withPoolKey = uniqueTokens.filter(t => !!t.poolKey);
  const withoutPoolKey = uniqueTokens.length - withPoolKey.length;

  const { enriched, dexPriced, geckoPriced, geckoFallbackCandidates } = await enrichWithPriceData(uniqueTokens, {
    enableGeckoFallback: geckoEnabled,
    geckoFallbackMaxAddresses: geckoEnabled ? GECKO_FALLBACK_MAX_ADDRESSES : 0,
  });

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
