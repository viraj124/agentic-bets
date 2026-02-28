"use client";

// @refresh reset
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

/**
 * Custom Wagmi Connect Button (watch balance + custom design)
 */
export const RainbowKitCustomConnectButton = () => {
  const networkColor = useNetworkColor();
  const { targetNetwork } = useTargetNetwork();
  const { address } = useAccount();
  const { data: nativeBalance } = useBalance({
    address,
    chainId: targetNetwork.id,
    query: {
      enabled: !!address,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
      gcTime: 30 * 60_000,
      placeholderData: previousData => previousData,
    },
  });

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
                      {nativeBalance ? formatEthBalance(nativeBalance.formatted) : (account.displayBalance ?? "0 ETH")}
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
