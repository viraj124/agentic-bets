import { getAddress } from "viem";

export type AddressIdentity = {
  ensName?: string | null;
  ensAvatar?: string | null;
  baseName?: string | null;
  baseAvatar?: string | null;
  weiName?: string | null;
};

export function shortenAddress(address: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function normalizeAddress(address: string) {
  try {
    return getAddress(address);
  } catch {
    return address;
  }
}

export function getAddressDisplayName(address: string, resolved?: AddressIdentity | null, fallbackName?: string) {
  const preferredName = resolved?.ensName || resolved?.weiName || resolved?.baseName;
  if (preferredName) return preferredName;

  if (fallbackName && fallbackName.trim() !== "") {
    const fallback = fallbackName.trim();
    if (fallback.toLowerCase() === address.toLowerCase()) return shortenAddress(address);
    if (/^0x[a-f0-9]{40}$/i.test(fallback)) return shortenAddress(fallback);
    return fallback;
  }
  return shortenAddress(address);
}

export function getAddressAvatar(resolved?: AddressIdentity | null) {
  return resolved?.ensAvatar || resolved?.baseAvatar || "";
}
