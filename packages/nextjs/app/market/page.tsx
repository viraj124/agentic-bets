"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { BetPanel } from "~~/components/bankrbets/BetPanel";
import { CreateMarketModal } from "~~/components/bankrbets/CreateMarketModal";
import { MarketCreatorBadge } from "~~/components/bankrbets/MarketCreatorBadge";
import { PriceChart } from "~~/components/bankrbets/PriceChart";
import { useGeckoTerminal } from "~~/hooks/bankrbets/useGeckoTerminal";
import { useLivePrice } from "~~/hooks/bankrbets/useLivePrice";
import { useCreatorEarnings, useCurrentRound } from "~~/hooks/bankrbets/usePredictionContract";
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
        <div className="w-14 h-14 rounded-2xl bg-pg-violet/10 border-2 border-pg-violet/20 flex items-center justify-center mb-4">
          <svg
            className="w-7 h-7 text-pg-violet/40"
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
        <h1 className="text-2xl font-extrabold mb-2 text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
          Select a token
        </h1>
        <p className="text-sm text-pg-muted mb-6">Pick a token from the home page to start predicting</p>
        <Link href="/" className="btn-outline-geo text-sm px-6 py-2">
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
        <span className="loading loading-spinner loading-md text-pg-violet" />
      </div>
    );
  }

  if (!predictionContract || !oracleContract) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="bg-base-100 rounded-2xl border-2 border-pg-border p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-pg-amber/10 border-2 border-pg-amber/20 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-7 h-7 text-pg-amber/50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-extrabold mb-2 text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
            Contracts not deployed
          </h2>
          <p className="text-sm text-pg-muted mb-5">
            Deploy BankrBetsPrediction and BankrBetsOracle to enable market interactions.
          </p>
          <Link href="/" className="btn-outline-geo text-sm px-6 py-2">
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
  const { data: poolData } = useGeckoTerminal(poolAddress || undefined, tokenAddress);
  const marketPoolAddress = poolData?.poolAddress || poolAddress;
  const { data: livePrice } = useLivePrice(marketPoolAddress || undefined, tokenAddress);
  const { epoch, round, isActive } = useCurrentRound(tokenAddress);
  const { address } = useAccount();
  const { creator, earningsFormatted } = useCreatorEarnings(tokenAddress);
  const livePriceUsd = livePrice?.priceUsd;
  const chartCurrentPrice = livePriceUsd && livePriceUsd > 0 ? livePriceUsd : poolData?.priceUsd;
  const isChartPriceDelayed = livePrice?.isDelayed ?? false;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const marketCreated = creator ? creator.toLowerCase() !== ZERO_ADDRESS : undefined;
  const isCreator = !!(
    address &&
    creator &&
    address.toLowerCase() === creator.toLowerCase() &&
    creator.toLowerCase() !== ZERO_ADDRESS
  );
  const hasCreator = !!(creator && creator.toLowerCase() !== ZERO_ADDRESS);

  const isLocked = round ? round.locked : false;
  const lockPrice = round ? Number(round.lockPrice) / 1e18 : 0;

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      {/* Back link + Token header */}
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-pg-muted hover:text-base-content transition-colors mb-3"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to markets
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1
                className="text-2xl font-extrabold tracking-tight text-base-content"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {poolData?.tokenName || `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`}
              </h1>
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-pg-mint/15 text-pg-mint rounded-full px-3 py-1 border border-pg-mint/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-pg-mint animate-pulse" />
                  Live
                </span>
              ) : marketCreated === false ? (
                <button onClick={() => setShowCreateModal(true)} className="btn-candy text-xs px-4 py-1.5">
                  Create Market
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-3 mt-1.5">
              <p className="text-xs text-pg-muted font-mono">{tokenAddress}</p>
              <MarketCreatorBadge creatorAddress={creator} />
            </div>
          </div>
          {poolData && (
            <div className="text-right flex-shrink-0">
              <p
                className="text-2xl font-extrabold font-mono tracking-tight text-base-content"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {poolData.priceFormatted}
              </p>
              <p className={`text-sm font-bold ${poolData.change1h >= 0 ? "text-pg-mint" : "text-pg-pink"}`}>
                {poolData.change1h >= 0 ? "+" : ""}
                {poolData.change1h.toFixed(2)}%<span className="text-pg-muted font-normal ml-1">1h</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create Market Modal */}
      {showCreateModal && marketPoolAddress && (
        <CreateMarketModal
          tokenAddress={tokenAddress}
          poolAddress={marketPoolAddress}
          tokenSymbol={poolData?.tokenName?.split("/")[0]}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column: Chart */}
        <div className="lg:col-span-2 space-y-5">
          {/* Price chart */}
          <div className="bg-base-100 rounded-2xl border-2 border-pg-border overflow-hidden">
            <div className="px-5 py-3 border-b-2 border-pg-border flex items-center justify-between">
              <span className="text-sm font-extrabold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
                Price chart
              </span>
              {marketPoolAddress && (
                <a
                  href={`https://www.geckoterminal.com/base/pools/${marketPoolAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-pg-violet hover:text-pg-violet/70 transition-colors"
                >
                  GeckoTerminal
                </a>
              )}
            </div>
            {marketPoolAddress ? (
              <PriceChart
                poolAddress={marketPoolAddress}
                tokenAddress={tokenAddress}
                currentPrice={chartCurrentPrice}
                priceDelayed={isChartPriceDelayed}
                lockPrice={isLocked && lockPrice > 0 ? lockPrice : undefined}
                isLocked={Boolean(isLocked)}
                epoch={epoch !== undefined ? Number(epoch) : undefined}
              />
            ) : (
              <div className="h-72 flex items-center justify-center">
                <p className="text-xs text-pg-muted">No pool data available</p>
              </div>
            )}
          </div>

          {/* Round pool stats */}
          {isActive && round && (
            <div className="bg-base-100 rounded-2xl border-2 border-pg-border p-4">
              <div className="flex items-center justify-between mb-3">
                <span
                  className="text-[10px] text-pg-muted uppercase tracking-wider font-bold"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Round #{epoch?.toString()} Pool
                </span>
                <span className="text-xs font-bold text-base-content font-mono">
                  ${(Number(round.totalAmount) / 1e6).toFixed(2)} total
                </span>
              </div>
              <div className="flex gap-3">
                <div className="flex-1 bg-pg-mint/10 border border-pg-mint/20 rounded-xl px-3 py-2.5">
                  <p className="text-[10px] text-pg-mint font-bold uppercase tracking-wider mb-1">↑ UP</p>
                  <p className="text-sm font-extrabold text-base-content font-mono">
                    ${(Number(round.bullAmount) / 1e6).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-pg-muted mt-0.5">
                    {round.totalAmount > 0n
                      ? ((Number(round.bullAmount) / Number(round.totalAmount)) * 100).toFixed(0)
                      : 50}
                    %
                  </p>
                </div>
                <div className="flex-1 bg-pg-pink/10 border border-pg-pink/20 rounded-xl px-3 py-2.5">
                  <p className="text-[10px] text-pg-pink font-bold uppercase tracking-wider mb-1">↓ DOWN</p>
                  <p className="text-sm font-extrabold text-base-content font-mono">
                    ${(Number(round.bearAmount) / 1e6).toFixed(2)}
                  </p>
                  <p className="text-[10px] text-pg-muted mt-0.5">
                    {round.totalAmount > 0n
                      ? ((Number(round.bearAmount) / Number(round.totalAmount)) * 100).toFixed(0)
                      : 50}
                    %
                  </p>
                </div>
              </div>
              <div className="mt-3 w-full h-1.5 bg-pg-pink/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-pg-mint rounded-full transition-all duration-500"
                  style={{
                    width: `${round.totalAmount > 0n ? (Number(round.bullAmount) / Number(round.totalAmount)) * 100 : 50}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right column: Bet panel + Market info */}
        <div className="space-y-4">
          <BetPanel
            tokenAddress={tokenAddress}
            tokenSymbol={poolData?.tokenName?.split("/")[0]}
            lockPrice={isLocked && lockPrice > 0 ? lockPrice : undefined}
            marketCreated={marketCreated}
            epoch={epoch}
            round={round}
            isActive={isActive}
          />

          {/* Market stats */}
          {poolData && (
            <div className="bg-base-100 rounded-2xl border-2 border-pg-border p-4">
              <h4
                className="text-[10px] text-pg-muted uppercase tracking-wider font-bold mb-3"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Market info
              </h4>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-pg-muted">Market cap</span>
                  <span className="font-bold" style={{ fontFamily: "var(--font-heading)" }}>
                    {poolData.marketCapFormatted}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-pg-muted">24h volume</span>
                  <span className="font-bold" style={{ fontFamily: "var(--font-heading)" }}>
                    ${(poolData.volume24h / 1000).toFixed(1)}K
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-pg-muted">Platform fee</span>
                  <span className="font-bold" style={{ fontFamily: "var(--font-heading)" }}>
                    2.1%
                  </span>
                </div>
                <div className="pt-2 mt-2 border-t-2 border-pg-border/50 flex justify-between text-[11px] text-pg-muted/70">
                  <span>Breakdown</span>
                  <span>1.5% treasury + 0.5% creator + 0.1% settler</span>
                </div>
              </div>
            </div>
          )}

          {/* Creator earnings */}
          {hasCreator && (
            <div className="bg-base-100 rounded-2xl border-2 border-pg-border p-4">
              <h4
                className="text-[10px] text-pg-muted uppercase tracking-wider font-bold mb-3"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {isCreator ? "Your creator earnings" : "Creator earnings"}
              </h4>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xl font-extrabold text-pg-mint font-mono">${earningsFormatted}</p>
                  <p className="text-[10px] text-pg-muted/60 mt-0.5">0.5% of every settled round pool</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-pg-mint/10 border-2 border-pg-mint/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-pg-mint font-extrabold text-sm">$</span>
                </div>
              </div>
              {!isCreator && creator && (
                <p className="text-[10px] text-pg-muted/50 font-mono mt-2">
                  {creator.slice(0, 8)}...{creator.slice(-6)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MarketPage;
