import React from "react";
import Link from "next/link";
import { useFetchNativeCurrencyPrice } from "@scaffold-ui/hooks";
import { hardhat } from "viem/chains";
import { CurrencyDollarIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { SwitchTheme } from "~~/components/SwitchTheme";
import { Faucet } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";

export const Footer = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;
  const { price: nativeCurrencyPrice } = useFetchNativeCurrencyPrice();

  return (
    <div className="min-h-0 py-4 px-1 mb-11 lg:mb-0">
      <div>
        <div className="fixed flex justify-between items-center w-full z-10 p-4 bottom-0 left-0 pointer-events-none">
          <div className="flex flex-col md:flex-row gap-2 pointer-events-auto">
            {nativeCurrencyPrice > 0 && (
              <div className="btn btn-sm font-normal gap-1 cursor-auto bg-base-100 border-base-300/60 text-base-content/60 shadow-sm">
                <CurrencyDollarIcon className="h-4 w-4" />
                <span>{nativeCurrencyPrice.toFixed(2)}</span>
              </div>
            )}
            {isLocalNetwork && (
              <>
                <Faucet />
                <Link
                  href="/blockexplorer"
                  passHref
                  className="btn btn-sm font-normal gap-1 bg-base-100 border-base-300/60 text-base-content/60 shadow-sm"
                >
                  <MagnifyingGlassIcon className="h-4 w-4" />
                  <span>Explorer</span>
                </Link>
              </>
            )}
          </div>
          <SwitchTheme className={`pointer-events-auto ${isLocalNetwork ? "self-end md:self-auto" : ""}`} />
        </div>
      </div>
      <div className="w-full">
        <div className="flex justify-center items-center gap-3 text-xs text-base-content/30">
          <span>BankrBets</span>
          <span>-</span>
          <span>Built on Base</span>
          <span>-</span>
          <a
            href="https://github.com/scaffold-eth/se-2"
            target="_blank"
            rel="noreferrer"
            className="hover:text-base-content/50 transition-colors"
          >
            Scaffold-ETH 2
          </a>
        </div>
      </div>
    </div>
  );
};
