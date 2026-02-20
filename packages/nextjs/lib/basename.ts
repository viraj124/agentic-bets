/**
 * Basename (.base.eth) resolution via the Base L2 Resolver contract,
 * with Alchemy NFT API fallback for the ENSIP-19 migration period.
 *
 * The on-chain reverse records in the old L2 Resolver were cleared during
 * the ENSIP-19 migration. As a workaround we fall back to the Alchemy NFT API
 * to check if the address owns a Basename NFT and extract the name from metadata.
 */
import { type Hex, createPublicClient, encodePacked, http, keccak256, namehash } from "viem";
import { base } from "viem/chains";

const L2_RESOLVER = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD" as const;
const BASENAME_CONTRACT = "0x03c4738ee98ae44591e1a4a4f3cab6641d95dd9a" as const;

const L2_RESOLVER_ABI = [
  {
    inputs: [{ internalType: "bytes32", name: "node", type: "bytes32" }],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "node", type: "bytes32" },
      { internalType: "string", name: "key", type: "string" },
    ],
    name: "text",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;
const BASE_RPC_URL = ALCHEMY_KEY ? `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` : "https://mainnet.base.org";

const baseClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC_URL),
});

/**
 * Compute the reverse node for a given address on a specific chain.
 *
 * Per EIP-181 / ENSIP-11 adapted for L2:
 *  1. coinType = (0x80000000 | chainId) >>> 0
 *  2. baseReverseNode = namehash("{COINTYPE_HEX}.reverse")
 *  3. addressNode = keccak256(lowercaseHexChars)  — hex chars as UTF-8 bytes, NOT decoded hex
 *  4. node = keccak256(encodePacked([baseReverseNode, addressNode]))
 */
function convertReverseNodeToBytes(address: string, chainId: number): Hex {
  const addressFormatted = address.toLowerCase();
  const addressNode = keccak256(addressFormatted.substring(2) as Hex);
  const coinType = (0x80000000 | chainId) >>> 0;
  const baseReverseNode = namehash(`${coinType.toString(16).toUpperCase()}.reverse`);
  return keccak256(encodePacked(["bytes32", "bytes32"], [baseReverseNode, addressNode]));
}

/**
 * Fallback: use Alchemy NFT API to find Basename owned by the address.
 * Returns the first .base.eth name found, or null.
 */
async function resolveBasenameViaAlchemy(address: string): Promise<string | null> {
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (!alchemyKey) return null;

  try {
    const url =
      `https://base-mainnet.g.alchemy.com/nft/v3/${alchemyKey}/getNFTsForOwner` +
      `?owner=${address}&contractAddresses[]=${BASENAME_CONTRACT}&withMetadata=true&pageSize=1`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      ownedNfts?: { name?: string; description?: string }[];
    };
    const nft = data.ownedNfts?.[0];
    if (!nft) return null;

    // The NFT name is "viraz.base.eth", description is "viraz.base.eth, a Basename"
    const name = nft.name;
    if (name && name.endsWith(".base.eth")) return name;

    return null;
  } catch {
    return null;
  }
}

export async function resolveBasename(address: string): Promise<string | null> {
  // 1. Try on-chain reverse resolution (L2 Resolver)
  try {
    const node = convertReverseNodeToBytes(address, base.id);
    const name = await baseClient.readContract({
      address: L2_RESOLVER,
      abi: L2_RESOLVER_ABI,
      functionName: "name",
      args: [node],
    });
    if (name && name.length > 0) return name;
  } catch {
    // fall through to fallback
  }

  // 2. Fallback: Alchemy NFT API (for ENSIP-19 migration period)
  return resolveBasenameViaAlchemy(address);
}

export async function resolveBasenameAvatar(basename: string): Promise<string | null> {
  if (!basename) return null;
  try {
    const avatar = await baseClient.readContract({
      address: L2_RESOLVER,
      abi: L2_RESOLVER_ABI,
      functionName: "text",
      args: [namehash(basename), "avatar"],
    });
    return avatar && avatar.length > 0 ? avatar : null;
  } catch {
    return null;
  }
}
