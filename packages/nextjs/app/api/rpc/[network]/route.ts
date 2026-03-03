/**
 * RPC proxy — forwards JSON-RPC requests to Alchemy using the server-only
 * ALCHEMY_API_KEY. Falls back to public RPCs when Alchemy is unavailable.
 *
 * Client usage:  /api/rpc/base-mainnet  (wagmi transport)
 *               /api/rpc/eth-mainnet   (ENS resolution fallback)
 */
import { NextRequest, NextResponse } from "next/server";

const ALCHEMY_MAP: Record<string, string> = {
  "base-mainnet": "https://base-mainnet.g.alchemy.com/v2",
  "eth-mainnet": "https://eth-mainnet.g.alchemy.com/v2",
};

const PUBLIC_FALLBACKS: Record<string, string[]> = {
  "base-mainnet": ["https://base-rpc.publicnode.com", "https://mainnet.base.org"],
  "eth-mainnet": ["https://ethereum-rpc.publicnode.com"],
};

async function tryUpstream(url: string, body: string): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) return res;
  } catch {
    /* fall through */
  }
  return null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ network: string }> }) {
  const { network } = await params;

  if (!ALCHEMY_MAP[network] && !PUBLIC_FALLBACKS[network]) {
    return NextResponse.json({ error: "Unknown network" }, { status: 400 });
  }

  const body = await req.text();
  const alchemyKey = process.env.ALCHEMY_API_KEY;

  // Try Alchemy first
  if (alchemyKey && ALCHEMY_MAP[network]) {
    const res = await tryUpstream(`${ALCHEMY_MAP[network]}/${alchemyKey}`, body);
    if (res) {
      const data = await res.text();
      return new NextResponse(data, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Fall back to public RPCs
  for (const url of PUBLIC_FALLBACKS[network] ?? []) {
    const res = await tryUpstream(url, body);
    if (res) {
      const data = await res.text();
      return new NextResponse(data, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return NextResponse.json({ error: "All RPC upstreams failed" }, { status: 502 });
}
