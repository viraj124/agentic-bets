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

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const cache = new Map<string, { ts: number; data: ResolvedIdentity }>();

function normalize(address: string) {
  return address.toLowerCase();
}

async function resolveAddress(address: string): Promise<ResolvedIdentity> {
  const lower = normalize(address);
  const cached = cache.get(lower);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const [ensName, baseName, weiName] = await Promise.all([
    resolveEnsName(lower),
    resolveBasename(lower),
    resolveWeiName(lower),
  ]);

  // Fetch avatar for whichever name resolved (ENS first, then Basename)
  let ensAvatar: string | null = null;
  let baseAvatar: string | null = null;
  if (ensName) {
    ensAvatar = await resolveEnsAvatar(ensName);
  } else if (baseName) {
    baseAvatar = await resolveBasenameAvatar(baseName);
  }

  const data: ResolvedIdentity = { address: lower, ensName, ensAvatar, baseName, baseAvatar, weiName };
  // Avoid long-lived negative cache entries so new names appear quickly
  if (ensName || baseName || weiName || ensAvatar || baseAvatar) {
    cache.set(lower, { ts: Date.now(), data });
  }
  return data;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const addresses = Array.isArray(body?.addresses) ? body.addresses : [];
  const unique: string[] = Array.from(new Set(addresses.filter((addr: string) => isAddress(addr)).map(normalize)));

  if (unique.length === 0) {
    return Response.json({ data: [] });
  }

  const results = await Promise.all(unique.map(resolveAddress));
  return Response.json({ data: results });
}
