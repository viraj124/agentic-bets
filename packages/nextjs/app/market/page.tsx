"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { BetPanel } from "~~/components/bankrbets/BetPanel";
import { CreateMarketModal } from "~~/components/bankrbets/CreateMarketModal";
import { MarketCreatorBadge } from "~~/components/bankrbets/MarketCreatorBadge";
import { RoundHistory } from "~~/components/bankrbets/RoundHistory";
import { useGeckoTerminal } from "~~/hooks/bankrbets/useGeckoTerminal";
import { useCreatorEarnings, useCurrentRound } from "~~/hooks/bankrbets/usePredictionContract";
import { useDeployedContractInfo, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { getOracleContractName, getPredictionContractName } from "~~/lib/contractResolver";

const PriceChart = dynamic(() => import("~~/components/bankrbets/PriceChart").then(m => m.PriceChart), {
  ssr: false,
  loading: () => (
    <div className="h-72 flex items-center justify-center">
      <span className="loading loading-spinner loading-md text-pg-violet" />
    </div>
  ),
});

const MarketPage: NextPage = () => {
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);
  const [poolAddress, setPoolAddress] = useState<string | null>(null);
  const [focusEpoch, setFocusEpoch] = useState<bigint | null>(null);

  useEffect(() => {
    const readLocation = () => {
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

      const roundParam = new URLSearchParams(window.location.search).get("round");
      if (!roundParam) {
        setFocusEpoch(null);
        return;
      }

      try {
        const parsed = BigInt(roundParam);
        setFocusEpoch(parsed > 0n ? parsed : null);
      } catch {
        setFocusEpoch(null);
      }
    };

    readLocation();
    window.addEventListener("hashchange", readLocation);
    window.addEventListener("popstate", readLocation);
    return () => {
      window.removeEventListener("hashchange", readLocation);
      window.removeEventListener("popstate", readLocation);
    };
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

  return (
    <MarketViewGate
      tokenAddress={tokenAddress}
      poolAddress={poolAddress}
      focusEpoch={focusEpoch}
      clearFocusEpoch={() => setFocusEpoch(null)}
    />
  );
};

function MarketViewGate({
  tokenAddress,
  poolAddress,
  focusEpoch,
  clearFocusEpoch,
}: {
  tokenAddress: string;
  poolAddress: string | null;
  focusEpoch: bigint | null;
  clearFocusEpoch: () => void;
}) {
  const predictionContractName = getPredictionContractName(tokenAddress);
  const oracleContractName = getOracleContractName(tokenAddress);

  const { data: predictionContract, isLoading: predictionLoading } = useDeployedContractInfo({
    contractName: predictionContractName,
  });
  const { data: oracleContract, isLoading: oracleLoading } = useDeployedContractInfo({
    contractName: oracleContractName,
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

  return (
    <MarketView
      tokenAddress={tokenAddress}
      poolAddress={poolAddress}
      focusEpoch={focusEpoch}
      clearFocusEpoch={clearFocusEpoch}
    />
  );
}

function MarketView({
  tokenAddress,
  poolAddress,
  focusEpoch,
  clearFocusEpoch,
}: {
  tokenAddress: string;
  poolAddress: string | null;
  focusEpoch: bigint | null;
  clearFocusEpoch: () => void;
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);

  const oracleContract = getOracleContractName(tokenAddress);
  const predictionContract = getPredictionContractName(tokenAddress);

  // Read pool address from on-chain Oracle when not provided in URL hash
  // (e.g. navigating from profile page which only has the token address)
  const { data: onChainMarket } = useScaffoldReadContract({
    contractName: oracleContract,
    functionName: "markets",
    args: [tokenAddress],
    query: { staleTime: 60_000 },
    watch: false,
  });
  const onChainPoolAddress =
    onChainMarket?.[1] && onChainMarket[1] !== "0x0000000000000000000000000000000000000000"
      ? onChainMarket[1].toLowerCase()
      : null;

  const effectivePoolAddress = poolAddress || onChainPoolAddress;
  const { data: poolData } = useGeckoTerminal(effectivePoolAddress || undefined, tokenAddress);
  const marketPoolAddress = poolData?.poolAddress || effectivePoolAddress;
  // Update URL hash to include pool address once resolved (helps with refreshes/bookmarks)
  useEffect(() => {
    if (!marketPoolAddress || poolAddress) return; // already in hash, or nothing to add
    const hash = window.location.hash.slice(1);
    if (hash && !hash.includes(",")) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#${tokenAddress},${marketPoolAddress}`,
      );
    }
  }, [marketPoolAddress, poolAddress, tokenAddress]);

  const { epoch, round, isActive } = useCurrentRound(tokenAddress);
  const { data: focusedRound } = useScaffoldReadContract({
    contractName: predictionContract,
    functionName: "getRound",
    args: [tokenAddress, focusEpoch ?? 0n],
    query: {
      enabled: focusEpoch !== null && focusEpoch > 0n,
      refetchInterval: 5000,
    },
    watch: false,
  });
  const { address } = useAccount();
  const { creator, earningsFormatted } = useCreatorEarnings(tokenAddress);
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const marketCreated = creator ? creator.toLowerCase() !== ZERO_ADDRESS : undefined;
  const isCreator = !!(
    address &&
    creator &&
    address.toLowerCase() === creator.toLowerCase() &&
    creator.toLowerCase() !== ZERO_ADDRESS
  );
  const hasCreator = !!(creator && creator.toLowerCase() !== ZERO_ADDRESS);

  const roundInView = focusEpoch !== null ? focusedRound : round;
  const epochInView = focusEpoch ?? epoch;
  const isHistoricalView = focusEpoch !== null && epoch !== undefined && focusEpoch !== epoch;

  const isLocked = roundInView ? roundInView.locked : false;
  const lockPrice = roundInView ? Number(roundInView.lockPrice) / 1e18 : 0;
  const isRoundInViewActive = roundInView ? !roundInView.oracleCalled && !roundInView.cancelled : isActive;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
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
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 sm:gap-3">
              <h1
                className="text-xl sm:text-2xl font-extrabold tracking-tight text-base-content truncate"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {poolData?.tokenName || `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`}
              </h1>
              {marketCreated ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-3 py-1 rounded-full bg-pg-violet/15 text-pg-violet border border-pg-violet/30">
                  <span className="text-[10px] leading-none">$</span>
                  BET
                </span>
              ) : marketCreated === false ? (
                <button onClick={() => setShowCreateModal(true)} className="btn-candy text-xs px-4 py-1.5">
                  Create
                </button>
              ) : null}
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-1.5 min-w-0">
              <p className="text-[10px] sm:text-xs text-pg-muted font-mono truncate max-w-[200px] sm:max-w-none">
                {tokenAddress}
              </p>
              <div className="flex-shrink-0">
                <MarketCreatorBadge creatorAddress={creator} />
              </div>
            </div>
            {focusEpoch !== null && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-pg-violet/30 bg-pg-violet/10 px-2.5 py-1">
                <span className="text-[11px] font-bold text-pg-violet">Viewing round #{focusEpoch.toString()}</span>
                <button
                  type="button"
                  onClick={() => {
                    const liveUrl = `/market#${tokenAddress}${marketPoolAddress ? `,${marketPoolAddress}` : ""}`;
                    window.history.replaceState(null, "", liveUrl);
                    clearFocusEpoch();
                  }}
                  className="text-[11px] font-bold text-pg-violet/80 hover:text-pg-violet transition-colors no-underline"
                >
                  Back to live
                </button>
              </div>
            )}
          </div>
          {poolData && (
            <div className="text-left sm:text-right flex-shrink-0">
              <p
                className="text-xl sm:text-2xl font-extrabold font-mono tracking-tight text-base-content"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {poolData.priceFormatted}
              </p>
              <p className={`text-xs sm:text-sm font-bold ${poolData.change1h >= 0 ? "text-pg-mint" : "text-pg-pink"}`}>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Left column: Chart */}
        <div className="lg:col-span-2 space-y-5">
          {/* Price chart */}
          <div className="bg-base-100 rounded-2xl border-2 border-pg-border">
            <div className="px-3 sm:px-5 py-3 border-b-2 border-pg-border flex items-center justify-between">
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
              <PriceChart poolAddress={marketPoolAddress} tokenAddress={tokenAddress} />
            ) : (
              <div className="h-72 flex flex-col items-center justify-center gap-2">
                <span className="loading loading-spinner loading-md text-pg-violet" />
                <p className="text-xs text-pg-muted">Loading chart data...</p>
              </div>
            )}
          </div>

          {/* Round pool stats */}
          {roundInView &&
            (() => {
              const isSettled = roundInView.oracleCalled;
              const isCancelled = roundInView.cancelled;
              const priceTie = roundInView.closePrice === roundInView.lockPrice;
              const tieBullWon = priceTie && !isCancelled && roundInView.bullAmount > roundInView.bearAmount;
              const tieBearWon = priceTie && !isCancelled && roundInView.bearAmount > roundInView.bullAmount;
              const upWon = isSettled && !isCancelled && (roundInView.closePrice > roundInView.lockPrice || tieBullWon);
              const downWon =
                isSettled && !isCancelled && (roundInView.closePrice < roundInView.lockPrice || tieBearWon);
              const closePriceNum = Number(roundInView.closePrice) / 1e18;
              const lockPriceNum = Number(roundInView.lockPrice) / 1e18;

              return (
                <div className="bg-base-100 rounded-2xl border-2 border-pg-border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className="text-[10px] text-pg-muted uppercase tracking-wider font-bold"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      Round #{epochInView?.toString()} Pool
                    </span>
                    <span className="text-xs font-bold text-base-content font-mono">
                      ${(Number(roundInView.totalAmount) / 1e6).toFixed(2)} total
                    </span>
                  </div>

                  {/* Winner banner */}
                  {isSettled && !isCancelled && (upWon || downWon) && (
                    <div
                      className={`mb-3 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-1 ${upWon ? "bg-pg-mint/15 border border-pg-mint/30" : "bg-pg-pink/15 border border-pg-pink/30"}`}
                    >
                      <span className={`text-xs font-extrabold ${upWon ? "text-pg-mint" : "text-pg-pink"}`}>
                        {upWon ? "↑ UP WON" : "↓ DOWN WON"}
                      </span>
                      {lockPriceNum > 0 && closePriceNum > 0 && (
                        <span className="text-[10px] text-pg-muted font-mono">
                          ${lockPriceNum.toFixed(5)} → ${closePriceNum.toFixed(5)}
                        </span>
                      )}
                    </div>
                  )}
                  {isSettled && isCancelled && (
                    <div className="mb-3 rounded-xl px-3 py-2 bg-pg-amber/10 border border-pg-amber/30">
                      <span className="text-xs font-extrabold text-pg-amber">Round Cancelled — Refunds Available</span>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <div
                      className={`flex-1 rounded-xl px-3 py-2.5 transition-all ${upWon ? "bg-pg-mint/20 border-2 border-pg-mint/60" : "bg-pg-mint/10 border border-pg-mint/20"}`}
                    >
                      <p className="text-[10px] text-pg-mint font-bold uppercase tracking-wider mb-1">↑ UP</p>
                      <p className="text-sm font-extrabold text-base-content font-mono">
                        ${(Number(roundInView.bullAmount) / 1e6).toFixed(2)}
                      </p>
                      <p className="text-[10px] text-pg-muted mt-0.5">
                        {roundInView.totalAmount > 0n
                          ? ((Number(roundInView.bullAmount) / Number(roundInView.totalAmount)) * 100).toFixed(0)
                          : 50}
                        %
                      </p>
                    </div>
                    <div
                      className={`flex-1 rounded-xl px-3 py-2.5 transition-all ${downWon ? "bg-pg-pink/20 border-2 border-pg-pink/60" : "bg-pg-pink/10 border border-pg-pink/20"}`}
                    >
                      <p className="text-[10px] text-pg-pink font-bold uppercase tracking-wider mb-1">↓ DOWN</p>
                      <p className="text-sm font-extrabold text-base-content font-mono">
                        ${(Number(roundInView.bearAmount) / 1e6).toFixed(2)}
                      </p>
                      <p className="text-[10px] text-pg-muted mt-0.5">
                        {roundInView.totalAmount > 0n
                          ? ((Number(roundInView.bearAmount) / Number(roundInView.totalAmount)) * 100).toFixed(0)
                          : 50}
                        %
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 w-full h-1.5 bg-pg-pink/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-pg-mint rounded-full transition-all duration-500"
                      style={{
                        width: `${roundInView.totalAmount > 0n ? (Number(roundInView.bullAmount) / Number(roundInView.totalAmount)) * 100 : 50}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })()}

          {/* Round history */}
          <RoundHistory tokenAddress={tokenAddress} currentEpoch={epoch} />
        </div>

        {/* Right column: Bet panel + Market info */}
        <div className="space-y-4">
          <BetPanel
            tokenAddress={tokenAddress}
            tokenSymbol={poolData?.tokenName?.split("/")[0]}
            tokenImgUrl={poolData?.imageUrl}
            lockPrice={isLocked && lockPrice > 0 ? lockPrice : undefined}
            marketCreated={marketCreated}
            epoch={epochInView}
            round={roundInView}
            isActive={isRoundInViewActive}
            historicalView={isHistoricalView}
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
                <div className="pt-2.5 mt-0.5 border-t-2 border-pg-border/50">
                  <p className="text-[10px] text-pg-muted/60 uppercase tracking-wider font-bold mb-2">Fee breakdown</p>
                  <div className="flex gap-1.5">
                    <div className="flex-1 rounded-lg bg-pg-violet/8 border border-pg-violet/20 px-2 py-1.5 text-center">
                      <p className="text-[11px] font-extrabold text-pg-violet">1.5%</p>
                      <p className="text-[9px] text-pg-muted/60 mt-0.5 uppercase tracking-wide">Treasury</p>
                    </div>
                    <div className="flex-1 rounded-lg bg-pg-mint/8 border border-pg-mint/20 px-2 py-1.5 text-center">
                      <p className="text-[11px] font-extrabold text-pg-mint">0.5%</p>
                      <p className="text-[9px] text-pg-muted/60 mt-0.5 uppercase tracking-wide">Creator</p>
                    </div>
                    <div className="flex-1 rounded-lg bg-pg-amber/8 border border-pg-amber/20 px-2 py-1.5 text-center">
                      <p className="text-[11px] font-extrabold text-pg-amber">0.1%</p>
                      <p className="text-[9px] text-pg-muted/60 mt-0.5 uppercase tracking-wide">Settler</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Creator earnings */}
          {hasCreator &&
            (() => {
              const pendingFee =
                round && round.locked && !round.oracleCalled && round.totalAmount > 0n
                  ? Number((round.totalAmount * 50n) / 10000n) / 1e6
                  : null;

              return (
                <div className="bg-base-100 rounded-2xl border-2 border-pg-border p-4">
                  <h4
                    className="text-[10px] text-pg-muted uppercase tracking-wider font-bold mb-3"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    {isCreator ? "Your creator earnings" : "Creator earnings"}
                  </h4>

                  {pendingFee !== null ? (
                    /* Locked round — show pending payout prominently */
                    <div className="space-y-3">
                      <div className="rounded-xl bg-pg-mint/10 border border-pg-mint/25 px-3 py-2.5 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-pg-mint font-bold uppercase tracking-wider mb-0.5">
                            Pending this round
                          </p>
                          <p className="text-xl font-extrabold text-pg-mint font-mono">
                            ${pendingFee.toFixed(pendingFee < 0.01 ? 4 : 2)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-pg-muted/60">0.5% of</p>
                          <p className="text-xs font-bold text-base-content font-mono">
                            ${(Number(round!.totalAmount) / 1e6).toFixed(2)} pool
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-pg-muted/60">Past rounds</span>
                        <span className="font-bold text-base-content font-mono">${earningsFormatted}</span>
                      </div>
                    </div>
                  ) : (
                    /* No locked round — show lifetime total */
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xl font-extrabold text-pg-mint font-mono">${earningsFormatted}</p>
                        <p className="text-[10px] text-pg-muted/60 mt-0.5">Lifetime total · auto-paid at settlement</p>
                      </div>
                    </div>
                  )}

                  {!isCreator && creator && (
                    <p className="text-[10px] text-pg-muted/50 font-mono mt-2">
                      {creator.slice(0, 8)}...{creator.slice(-6)}
                    </p>
                  )}
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}

export default MarketPage;
