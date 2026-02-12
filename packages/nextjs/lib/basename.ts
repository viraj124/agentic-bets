/**
 * Basename (.base.eth) resolution via the Base L2 Resolver contract.
 * Adapted from https://github.com/apoorvlathey/bankr-wallet
 */
import { type Hex, createPublicClient, encodePacked, http, keccak256, namehash } from "viem";
import { base } from "viem/chains";

const L2_RESOLVER = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD" as const;

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

const baseClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
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
  // keccak256 of the lowercase hex chars (without 0x) as UTF-8 bytes (EIP-181)
  const addressNode = keccak256(addressFormatted.substring(2) as Hex);
  const coinType = (0x80000000 | chainId) >>> 0;
  const baseReverseNode = namehash(`${coinType.toString(16).toUpperCase()}.reverse`);
  return keccak256(encodePacked(["bytes32", "bytes32"], [baseReverseNode, addressNode]));
}

export async function resolveBasename(address: string): Promise<string | null> {
  try {
    const node = convertReverseNodeToBytes(address, base.id);
    const name = await baseClient.readContract({
      address: L2_RESOLVER,
      abi: L2_RESOLVER_ABI,
      functionName: "name",
      args: [node],
    });
    return name && name.length > 0 ? name : null;
  } catch {
    return null;
  }
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
