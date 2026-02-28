"use client";

import Link from "next/link";
import { BlockieAvatar } from "~~/components/scaffold-eth/BlockieAvatar";
import type { ResolvedIdentity } from "~~/hooks/bankrbets/useResolvedAddresses";
import { getAddressAvatar, getAddressDisplayName, normalizeAddress, shortenAddress } from "~~/lib/addressDisplay";

interface IdentityBadgeProps {
  address: string;
  resolved?: ResolvedIdentity;
  size?: "sm" | "md";
  showAddress?: boolean;
  href?: string;
}

const SIZE_MAP = {
  sm: "h-6 w-6 text-xs",
  md: "h-8 w-8 text-sm",
};

const NAME_SIZE_MAP = {
  sm: "text-xs",
  md: "text-sm",
};

export function IdentityBadge({ address, resolved, size = "sm", showAddress = false, href }: IdentityBadgeProps) {
  const checksumAddress = normalizeAddress(address);
  const short = shortenAddress(checksumAddress);
  const displayName = getAddressDisplayName(checksumAddress, resolved);
  const avatarUrl = getAddressAvatar(resolved);
  const shouldRenderAddressLine = showAddress && displayName.toLowerCase() !== short.toLowerCase();
  const link = href || `https://basescan.org/address/${address}`;

  return (
    <div className="flex items-center gap-2 min-w-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className={`rounded-full object-cover border border-pg-border ${SIZE_MAP[size]}`}
        />
      ) : (
        <div className={`${SIZE_MAP[size]} rounded-full overflow-hidden border border-pg-border`}>
          <BlockieAvatar address={address} size={size === "md" ? 32 : 24} />
        </div>
      )}

      <div className="min-w-0">
        <Link
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className={`${NAME_SIZE_MAP[size]} font-semibold text-base-content hover:text-pg-violet transition-colors truncate block`}
        >
          {displayName}
        </Link>
        {shouldRenderAddressLine && (
          <div className="text-[10px] text-pg-muted font-mono truncate" title={checksumAddress}>
            {short}
          </div>
        )}
      </div>
    </div>
  );
}
