/**
 * RPC proxy — forwards JSON-RPC requests to Alchemy using the server-only
 * ALCHEMY_API_KEY. The key never appears in the client JS bundle.
 *
 * Client usage:  /api/rpc/base-mainnet  (wagmi transport)
 *               /api/rpc/eth-mainnet   (ENS resolution fallback)
 */
import { NextRequest, NextResponse } from "next/server";

const NETWORK_MAP: Record<string, string> = {
  "base-mainnet": "https://base-mainnet.g.alchemy.com/v2",
  "eth-mainnet": "https://eth-mainnet.g.alchemy.com/v2",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ network: string }> }) {
  const { network } = await params;
  const alchemyKey = process.env.ALCHEMY_API_KEY;

  if (!alchemyKey) {
    return NextResponse.json({ error: "RPC not configured" }, { status: 503 });
  }

  const baseUrl = NETWORK_MAP[network];
  if (!baseUrl) {
    return NextResponse.json({ error: "Unknown network" }, { status: 400 });
  }

  const body = await req.text();

  const upstream = await fetch(`${baseUrl}/${alchemyKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const data = await upstream.text();
  return new NextResponse(data, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
