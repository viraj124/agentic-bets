import { NextRequest } from "next/server";
import { isAddress } from "viem";
import { resolveBasename, resolveBasenameAvatar } from "~~/lib/basename";
import { resolveEnsAvatar, resolveEnsName } from "~~/lib/ens";
import { resolveWeiName } from "~~/lib/weiName";

type ResolvedIdentity = {
  address: string;
  ensName?: string | null;
  ensAvatar?: string | null;
  baseName?: string | null;
  baseAvatar?: string | null;
  weiName?: string | null;
};

const POSITIVE_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 30 * 1000;
const cache = new Map<string, { ts: number; ttlMs: number; data: ResolvedIdentity; hasIdentity: boolean }>();

function normalize(address: string) {
  return address.toLowerCase();
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>(resolve => {
    timeoutId = setTimeout(() => resolve(fallback), ms);
  });
  const result = await Promise.race([promise, timeoutPromise]).catch(() => fallback);
  if (timeoutId) clearTimeout(timeoutId);
  return result;
}

async function resolveAddress(address: string, highPriority: boolean): Promise<ResolvedIdentity> {
  const lower = normalize(address);
  const cached = cache.get(lower);
  if (
    cached &&
    Date.now() - cached.ts < cached.ttlMs &&
    // For connect/profile (single address), avoid trusting stale negative cache.
    !(highPriority && !cached.hasIdentity)
  ) {
    return cached.data;
  }

  const ensTimeoutMs = highPriority ? 2200 : 2000;
  const baseTimeoutMs = highPriority ? 6000 : 5000;
  const weiTimeoutMs = highPriority ? 2000 : 1500;

  const [ensName, baseName, weiName] = await Promise.all([
    withTimeout(resolveEnsName(lower), ensTimeoutMs, null),
    withTimeout(resolveBasename(lower), baseTimeoutMs, null),
    withTimeout(resolveWeiName(lower), weiTimeoutMs, null),
  ]);

  // Fetch avatars in parallel for whichever names resolved
  const [ensAvatar, baseAvatar] = await Promise.all([
    ensName ? withTimeout(resolveEnsAvatar(ensName), 1800, null) : null,
    baseName ? withTimeout(resolveBasenameAvatar(baseName), 1800, null) : null,
  ]);

  const data: ResolvedIdentity = { address: lower, ensName, ensAvatar, baseName, baseAvatar, weiName };
  const hasIdentity = !!(ensName || baseName || weiName || ensAvatar || baseAvatar);
  cache.set(lower, {
    ts: Date.now(),
    ttlMs: hasIdentity ? POSITIVE_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS,
    data,
    hasIdentity,
  });
  return data;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const addresses = Array.isArray(body?.addresses) ? body.addresses : [];
  const unique: string[] = Array.from(new Set(addresses.filter((addr: string) => isAddress(addr)).map(normalize)));

  if (unique.length === 0) {
    return Response.json({ data: [] });
  }

  const highPriority = unique.length <= 2;
  const results = await Promise.all(unique.map(addr => resolveAddress(addr, highPriority)));
  return Response.json({ data: results });
}
