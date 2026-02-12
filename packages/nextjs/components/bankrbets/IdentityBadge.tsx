"use client";

import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import { BlockieAvatar } from "~~/components/scaffold-eth/BlockieAvatar";
import type { ResolvedIdentity } from "~~/hooks/bankrbets/useResolvedAddresses";

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

export function IdentityBadge({ address, resolved, size = "sm", showAddress = false, href }: IdentityBadgeProps) {
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const displayName = resolved?.ensName || resolved?.baseName || resolved?.weiName || short;
  const avatarUrl = resolved?.ensAvatar || resolved?.baseAvatar || "";
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
          className="text-xs font-semibold text-base-content hover:text-pg-violet transition-colors truncate block"
        >
          {displayName}
        </Link>
        {showAddress && (
          <div className="text-[10px] text-pg-muted">
            <Address address={address} />
          </div>
        )}
      </div>
    </div>
  );
}
