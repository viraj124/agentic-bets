/**
 * Wei Name Service (WNS) reverse resolution
 * Adapted from https://import.wei.domains/wei.js
 */
import { isAddress } from "viem";

const CONTRACT = "0x0000000000696760E15f265e828DB644A0c242EB";

const RPC_ENDPOINTS = [
  process.env.MAINNET_RPC_URL,
  process.env.NEXT_PUBLIC_ALCHEMY_API_KEY
    ? `https://eth-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
    : undefined,
  "https://eth.llamarpc.com",
  "https://ethereum.publicnode.com",
  "https://1rpc.io/eth",
  "https://eth.drpc.org",
].filter(Boolean) as string[];

const SEL = {
  reverseResolve: "0x9af8b7aa",
};

function encodeAddress(addr: string): string {
  return addr.toLowerCase().replace("0x", "").padStart(64, "0");
}

function decodeString(hex: string | null): string | null {
  if (!hex || hex === "0x" || hex.length < 130) return null;
  const data = hex.slice(2);
  const len = parseInt(data.slice(64, 128), 16);
  if (len === 0) return "";
  const strHex = data.slice(128, 128 + len * 2);
  const bytes: number[] = [];
  for (let i = 0; i < strHex.length; i += 2) {
    bytes.push(parseInt(strHex.slice(i, i + 2), 16));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

async function ethCall(data: string): Promise<string> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: CONTRACT, data }, "latest"],
  });

  for (const rpc of RPC_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const json = await res.json();
      if (json.error) continue;
      return json.result;
    } catch {
      continue;
    }
  }
  throw new Error("All WNS RPC endpoints failed");
}

export async function resolveWeiName(address: string): Promise<string | null> {
  if (!address || !isAddress(address)) return null;
  try {
    const data = SEL.reverseResolve + encodeAddress(address);
    const result = await ethCall(data);
    const name = decodeString(result);
    return name || null;
  } catch {
    return null;
  }
}
