import { useMemo, useRef } from "react";
import { Address } from "viem";
import { useDisconnect } from "wagmi";
import { ArrowLeftOnRectangleIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import { useResolvedAddresses } from "~~/hooks/bankrbets/useResolvedAddresses";
import { useOutsideClick } from "~~/hooks/scaffold-eth";
import { getAddressAvatar, getAddressDisplayName, normalizeAddress, shortenAddress } from "~~/lib/addressDisplay";

type AddressInfoDropdownProps = {
  address: Address;
  displayName: string;
  ensAvatar?: string;
};

export const AddressInfoDropdown = ({ address, ensAvatar, displayName }: AddressInfoDropdownProps) => {
  const { disconnectAsync, connectors, isPending } = useDisconnect();
  const checkSumAddress = normalizeAddress(address);
  const addresses = useMemo(() => [address], [address]);
  const { data: resolvedMap } = useResolvedAddresses(addresses);
  const resolved = resolvedMap?.get(address.toLowerCase());
  const effectiveDisplayName = getAddressDisplayName(checkSumAddress, resolved, displayName);
  const effectiveAvatar = getAddressAvatar(resolved) || ensAvatar;
  const shortAddress = shortenAddress(checkSumAddress);

  const dropdownRef = useRef<HTMLDetailsElement>(null);

  const closeDropdown = () => {
    dropdownRef.current?.removeAttribute("open");
  };

  const handleDisconnect = async () => {
    closeDropdown();

    const snapshot = Array.from(new Map(connectors.map(connector => [connector.uid, connector])).values());
    if (snapshot.length === 0) {
      await disconnectAsync();
      return;
    }

    for (const connector of snapshot) {
      try {
        await disconnectAsync({ connector });
      } catch {
        // Ignore "not connected" races while clearing multiple sessions.
      }
    }
  };

  useOutsideClick(dropdownRef, closeDropdown);

  return (
    <details ref={dropdownRef} className="dropdown dropdown-end leading-3">
      <summary className="btn btn-secondary btn-sm pl-0 pr-2 shadow-md dropdown-toggle gap-0 h-auto!">
        <BlockieAvatar address={checkSumAddress} size={30} ensImage={effectiveAvatar} />
        <span className="ml-2 mr-1">{effectiveDisplayName || shortAddress}</span>
        <ChevronDownIcon className="h-6 w-4 ml-2 sm:ml-0" />
      </summary>
      <ul className="dropdown-content menu z-2 p-2 mt-2 shadow-center shadow-accent bg-base-200 rounded-box gap-1">
        <li>
          <button
            className="menu-item text-error h-8 btn-sm rounded-xl! flex gap-3 py-3"
            type="button"
            onClick={() => void handleDisconnect()}
            disabled={isPending}
          >
            <ArrowLeftOnRectangleIcon className="h-6 w-4 ml-2 sm:ml-0" />
            <span>Disconnect</span>
          </button>
        </li>
      </ul>
    </details>
  );
};
