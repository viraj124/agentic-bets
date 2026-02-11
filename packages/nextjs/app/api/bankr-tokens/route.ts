import { NextResponse } from "next/server";

// ── Config ───────────────────────────────────────────────────────────

const CLANKER_API = "https://www.clanker.world/api/tokens";
const CLANKER_PAGE_SIZE = 20;
const CLANKER_MAX_PAGES = 10; // 200 tokens max — covers all meaningful ones
const REGISTRY_URL = "https://raw.githubusercontent.com/BankrBot/tokenized-agents/main/AGENTS.md";
const CACHE_TTL_MS = 2 * 60_000;

// ── Cache ────────────────────────────────────────────────────────────

const cache = {
  addresses: [] as string[],
  updatedAt: 0,
};

// ── Data sources ─────────────────────────────────────────────────────

/** Primary: Clanker public API — returns all Bankr tokens sorted by market cap */
async function fetchFromClanker(): Promise<string[]> {
  const addresses = new Set<string>();
  let cursor: string | null = null;

  for (let page = 0; page < CLANKER_MAX_PAGES; page++) {
    const url = new URL(CLANKER_API);
    url.searchParams.set("socialInterface", "Bankr");
    url.searchParams.set("chainId", "8453");
    url.searchParams.set("limit", String(CLANKER_PAGE_SIZE));
    url.searchParams.set("sortBy", "market-cap");
    url.searchParams.set("sort", "desc");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString());
    if (!res.ok) break;

    const json = await res.json();
    const items = json?.data;
    if (!Array.isArray(items) || items.length === 0) break;

    for (const item of items) {
      const addr = (item.contract_address || "").toLowerCase();
      if (/^0x[a-f0-9]{40}$/.test(addr)) addresses.add(addr);
    }

    const nextCursor = json?.cursor;
    if (!nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }

  return [...addresses];
}

/** Fallback: GitHub AGENTS.md registry */
async function fetchFromRegistry(): Promise<string[]> {
  const res = await fetch(REGISTRY_URL);
  if (!res.ok) return [];
  const md = await res.text();
  const matches = md.match(/`(0x[a-fA-F0-9]{40})`/g) || [];
  return [...new Set(matches.map(m => m.replace(/`/g, "").toLowerCase()))];
}

// ── Route handler ────────────────────────────────────────────────────

export async function GET() {
  const now = Date.now();

  // Return cached data if fresh
  if (now - cache.updatedAt < CACHE_TTL_MS && cache.addresses.length > 0) {
    return NextResponse.json({
      addresses: cache.addresses,
      count: cache.addresses.length,
    });
  }

  // Fetch both sources in parallel — Clanker has most tokens, registry has BNKR
  const [clankerAddrs, registryAddrs] = await Promise.all([
    fetchFromClanker().catch(() => [] as string[]),
    fetchFromRegistry().catch(() => [] as string[]),
  ]);

  // Merge all sources (never lose tokens)
  const merged = new Set([...cache.addresses, ...clankerAddrs, ...registryAddrs]);
  cache.addresses = [...merged];
  cache.updatedAt = Date.now();

  return NextResponse.json({
    addresses: cache.addresses,
    count: cache.addresses.length,
  });
}
