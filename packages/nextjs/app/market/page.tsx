"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { BetPanel } from "~~/components/bankrbets/BetPanel";
import { CreateMarketModal } from "~~/components/bankrbets/CreateMarketModal";
import { MarketCreatorBadge } from "~~/components/bankrbets/MarketCreatorBadge";
import { PriceChart } from "~~/components/bankrbets/PriceChart";
import { RoundTimer } from "~~/components/bankrbets/RoundTimer";
import { useGeckoTerminal } from "~~/hooks/bankrbets/useGeckoTerminal";
import { useCurrentRound } from "~~/hooks/bankrbets/usePredictionContract";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";

const MarketPage: NextPage = () => {
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);
  const [poolAddress, setPoolAddress] = useState<string | null>(null);

  useEffect(() => {
    const readHash = () => {
      const hash = window.location.hash.slice(1);
      if (hash && hash.startsWith("0x")) {
        const parts = hash.split(",");
        if (parts.length >= 2) {
          setTokenAddress(parts[0]);
          setPoolAddress(parts[1]);
        } else {
          setTokenAddress(hash);
        }
      }
    };

    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  if (!tokenAddress) {
    return (
      <div className="flex flex-col items-center justify-center grow py-24">
        <div className="w-16 h-16 rounded-full bg-base-200 flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-base-content/30"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Select a token</h1>
        <p className="text-base-content/50 mb-6 text-sm">Pick a token from the home page to start predicting</p>
        <Link href="/" className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">
          Browse tokens
        </Link>
      </div>
    );
  }

  return <MarketViewGate tokenAddress={tokenAddress} poolAddress={poolAddress} />;
};

function MarketViewGate({ tokenAddress, poolAddress }: { tokenAddress: string; poolAddress: string | null }) {
  const { data: predictionContract, isLoading: predictionLoading } = useDeployedContractInfo({
    contractName: "BankrBetsPrediction",
  });
  const { data: oracleContract, isLoading: oracleLoading } = useDeployedContractInfo({
    contractName: "BankrBetsOracle",
  });

  if (predictionLoading || oracleLoading) {
    return (
      <div className="flex items-center justify-center grow py-24">
        <span className="loading loading-spinner loading-md text-primary" />
      </div>
    );
  }

  if (!predictionContract || !oracleContract) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="bg-base-100 rounded-xl border border-base-300/60 p-6 text-center">
          <h2 className="text-lg font-bold mb-2">Market contracts not deployed</h2>
          <p className="text-sm text-base-content/60 mb-4">
            Deploy BankrBetsPrediction and BankrBetsOracle to enable market interactions.
          </p>
          <Link href="/" className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">
            Back to tokens
          </Link>
        </div>
      </div>
    );
  }

  return <MarketView tokenAddress={tokenAddress} poolAddress={poolAddress} />;
}

function MarketView({ tokenAddress, poolAddress }: { tokenAddress: string; poolAddress: string | null }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { data: poolData } = useGeckoTerminal(poolAddress || undefined);
  const { epoch, round, isActive } = useCurrentRound(tokenAddress);

  const lockTimestamp = round ? Number(round[3]) : 0;
  const closeTimestamp = round ? Number(round[4]) : 0;
  const isLocked = round ? round[11] : false;
  const lockPrice = round ? Number(round[5]) / 1e18 : 0;

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      {/* Back link + Token header */}
      <div className="mb-6">
        <Link
          href="/"
          className="text-xs text-base-content/40 hover:text-base-content/60 transition-colors mb-3 inline-block"
        >
          &larr; Back to markets
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                {poolData?.tokenName || `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`}
              </h1>
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-success/10 text-success rounded-full px-2.5 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  Live
                </span>
              ) : (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium bg-base-content text-base-100 rounded-full px-3 py-1.5 hover:bg-base-content/80 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Create Market
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-xs text-base-content/40 font-mono">{tokenAddress}</p>
              <MarketCreatorBadge tokenAddress={tokenAddress} />
            </div>
          </div>
          {poolData && (
            <div className="text-right">
              <p className="text-2xl font-bold font-mono tracking-tight">{poolData.priceFormatted}</p>
              <p className={`text-sm font-medium ${poolData.change1h >= 0 ? "text-success" : "text-error"}`}>
                {poolData.change1h >= 0 ? "+" : ""}
                {poolData.change1h.toFixed(2)}%<span className="text-base-content/40 font-normal ml-1">1h</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create Market Modal */}
      {showCreateModal && poolAddress && (
        <CreateMarketModal
          tokenAddress={tokenAddress}
          poolAddress={poolAddress}
          tokenSymbol={poolData?.tokenName?.split("/")[0]}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column: Chart + Round info */}
        <div className="lg:col-span-2 space-y-5">
          {/* Price chart */}
          <div className="bg-base-100 rounded-xl border border-base-300/60 overflow-hidden">
            <div className="px-5 py-3 border-b border-base-300/60 flex items-center justify-between">
              <span className="text-sm font-semibold">Price chart</span>
              {poolAddress && (
                <a
                  href={`https://www.geckoterminal.com/base/pools/${poolAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  GeckoTerminal
                </a>
              )}
            </div>
            {poolAddress ? (
              <PriceChart poolAddress={poolAddress} />
            ) : (
              <div className="h-72 flex items-center justify-center text-base-content/20">
                <p className="text-xs">No pool data available</p>
              </div>
            )}
          </div>

          {/* Round info */}
          {isActive && round && (
            <div className="bg-base-100 rounded-xl border border-base-300/60 p-5">
              <RoundTimer
                lockTimestamp={lockTimestamp}
                closeTimestamp={closeTimestamp}
                isLocked={isLocked as boolean}
              />

              <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-base-300/60">
                <div className="text-center">
                  <p className="text-[11px] text-base-content/40 uppercase tracking-wider mb-1">Epoch</p>
                  <p className="text-lg font-bold">#{epoch?.toString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-[11px] text-base-content/40 uppercase tracking-wider mb-1">Lock Price</p>
                  <p className="text-lg font-bold font-mono">{lockPrice > 0 ? `$${lockPrice.toFixed(6)}` : "--"}</p>
                </div>
                <div className="text-center">
                  <p className="text-[11px] text-base-content/40 uppercase tracking-wider mb-1">Status</p>
                  <p className="text-lg font-bold">
                    {isLocked ? (
                      <span className="text-warning">Locked</span>
                    ) : (
                      <span className="text-success">Open</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right column: Bet panel + Market info */}
        <div className="space-y-4">
          <BetPanel tokenAddress={tokenAddress} tokenSymbol={poolData?.tokenName?.split("/")[0]} />

          {/* Market stats */}
          {poolData && (
            <div className="bg-base-100 rounded-xl border border-base-300/60 p-4">
              <h4 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">Market info</h4>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-base-content/50">Market cap</span>
                  <span className="font-medium">{poolData.marketCapFormatted}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-content/50">24h volume</span>
                  <span className="font-medium">${(poolData.volume24h / 1000).toFixed(1)}K</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-content/50">Platform fee</span>
                  <span className="font-medium">2.1%</span>
                </div>
                <div className="flex justify-between text-xs text-base-content/35">
                  <span>Breakdown</span>
                  <span>1.5% treasury + 0.5% creator + 0.1% settler</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MarketPage;
