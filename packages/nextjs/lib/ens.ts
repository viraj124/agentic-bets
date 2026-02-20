import { createPublicClient, http, isAddress } from "viem";
import { mainnet } from "viem/chains";

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;
const MAINNET_RPC_URL =
  process.env.MAINNET_RPC_URL || (ALCHEMY_KEY ? `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` : undefined);

const ensClient = MAINNET_RPC_URL ? createPublicClient({ chain: mainnet, transport: http(MAINNET_RPC_URL) }) : null;

export async function resolveEnsName(address: string): Promise<string | null> {
  if (!ensClient || !isAddress(address)) return null;
  try {
    const name = await ensClient.getEnsName({ address });
    return name || null;
  } catch {
    return null;
  }
}

export async function resolveEnsAvatar(name: string | null): Promise<string | null> {
  if (!ensClient || !name) return null;
  try {
    const avatar = await ensClient.getEnsAvatar({ name });
    return avatar || null;
  } catch {
    return null;
  }
}
