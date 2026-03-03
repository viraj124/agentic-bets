"use client";

// @refresh reset
import { useEffect, useRef } from "react";
import { AddressInfoDropdown } from "./AddressInfoDropdown";
import { AddressQRCodeModal } from "./AddressQRCodeModal";
import { RevealBurnerPKModal } from "./RevealBurnerPKModal";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Address } from "viem";
import { useAccount, useBalance } from "wagmi";
import { useNetworkColor } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";

function formatEthBalance(balanceFormatted: string): string {
  const value = Number(balanceFormatted);
  if (!Number.isFinite(value) || value <= 0) return "0 ETH";
  if (value < 0.0001) return "<0.0001 ETH";
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 4 })} ETH`;
}

const nativeBalanceCache = new Map<string, string>();

/**
 * Custom Wagmi Connect Button (watch balance + custom design)
 */
export const RainbowKitCustomConnectButton = () => {
  const networkColor = useNetworkColor();
  const { targetNetwork } = useTargetNetwork();
  const { address } = useAccount();
  const normalizedAddress = address?.toLowerCase();
  const warmedRef = useRef(new Set<string>());
  const { data: nativeBalance } = useBalance({
    address,
    chainId: targetNetwork.id,
    query: {
      enabled: !!address,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      gcTime: 2 * 60 * 60_000,
      retry: 1,
      placeholderData: previousData => previousData,
    },
  });
  const cachedNativeBalance = normalizedAddress ? nativeBalanceCache.get(normalizedAddress) : undefined;

  useEffect(() => {
    if (!normalizedAddress || !nativeBalance) return;
    nativeBalanceCache.set(normalizedAddress, formatEthBalance(nativeBalance.formatted));
  }, [normalizedAddress, nativeBalance]);

  useEffect(() => {
    if (!normalizedAddress || warmedRef.current.has(normalizedAddress)) return;
    warmedRef.current.add(normalizedAddress);

    void fetch(`/api/user-stats?address=${normalizedAddress}`).catch(() => undefined);
    void fetch("/api/resolve-addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses: [normalizedAddress] }),
      keepalive: true,
    }).catch(() => undefined);
  }, [normalizedAddress]);

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openChainModal, mounted }) => {
        const connected = mounted && account && chain;

        return (
          <>
            {(() => {
              if (!connected) {
                return (
                  <button className="btn btn-primary btn-sm" onClick={openConnectModal} type="button">
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported || chain.id !== targetNetwork.id) {
                return (
                  <button className="btn btn-error btn-sm" type="button" onClick={openChainModal}>
                    Switch Network
                  </button>
                );
              }

              return (
                <>
                  <div className="flex flex-col items-center mr-2">
                    <span className="text-[0.8em] leading-tight">
                      {nativeBalance
                        ? formatEthBalance(nativeBalance.formatted)
                        : (cachedNativeBalance ?? account.displayBalance ?? "0 ETH")}
                    </span>
                    <span className="text-xs" style={{ color: networkColor }}>
                      {chain.name}
                    </span>
                  </div>
                  <AddressInfoDropdown
                    address={account.address as Address}
                    displayName={account.displayName}
                    ensAvatar={account.ensAvatar}
                  />
                  <AddressQRCodeModal address={account.address as Address} modalId="qrcode-modal" />
                  <RevealBurnerPKModal />
                </>
              );
            })()}
          </>
        );
      }}
    </ConnectButton.Custom>
  );
};
