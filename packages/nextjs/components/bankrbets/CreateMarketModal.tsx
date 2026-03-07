"use client";

import { useState } from "react";
import Link from "next/link";
import { useCreateMarket } from "~~/hooks/bankrbets/useCreateMarket";
import { useMarketCreated } from "~~/hooks/bankrbets/usePredictionContract";

interface CreateMarketModalProps {
  tokenAddress: string;
  poolAddress: string;
  tokenSymbol?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CreateMarketModal({
  tokenAddress,
  poolAddress,
  tokenSymbol,
  onClose,
  onSuccess,
}: CreateMarketModalProps) {
  const { createMarket, isCreating } = useCreateMarket();
  const marketCreated = useMarketCreated(tokenAddress);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleCreate = async () => {
    setError(null);
    try {
      await createMarket(tokenAddress);
      setSuccess(true);
      onSuccess?.();
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || "Transaction failed");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-pg-slate/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-pop-in bg-base-100 rounded-xl sm:rounded-2xl border-2 border-pg-slate shadow-pop-hover w-full max-w-sm sm:max-w-md mx-2 sm:mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b-2 border-pg-border flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
            Create Prediction Market
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border-2 border-pg-border flex items-center justify-center text-pg-muted hover:border-pg-slate hover:text-base-content transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {marketCreated ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-2xl bg-pg-violet/15 border-2 border-pg-violet/30 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-pg-violet"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  />
                </svg>
              </div>
              <p
                className="font-extrabold text-xl mb-1 text-base-content"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Market already exists
              </p>
              <p className="text-sm text-pg-muted mb-6">
                A prediction market for {tokenSymbol || "this token"} has already been created.
              </p>
              <div className="flex gap-3">
                <button onClick={onClose} className="btn-outline-geo flex-1 text-sm">
                  Close
                </button>
                <Link
                  href={`/market#${tokenAddress},${poolAddress}`}
                  className="btn-candy flex-1 text-sm text-center"
                  onClick={onClose}
                >
                  View Market
                </Link>
              </div>
            </div>
          ) : success ? (
            <div className="text-center py-6">
              {/* Success icon */}
              <div className="w-16 h-16 rounded-2xl bg-pg-mint/15 border-2 border-pg-mint/30 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-pg-mint"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p
                className="font-extrabold text-xl mb-1 text-base-content"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Market created!
              </p>
              <p className="text-sm text-pg-muted">
                You{"'"}ll earn 0.5% of every round{"'"}s pool as the market creator.
              </p>
              <p className="text-xs text-pg-muted/70 mt-1">Round 1 starts when the first bet is placed.</p>
              <button onClick={onClose} className="btn-candy mt-6 text-sm">
                Start betting
              </button>
            </div>
          ) : (
            <>
              {/* Token info */}
              <div className="bg-pg-cream rounded-xl p-4 mb-5 border-2 border-pg-border">
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl bg-pg-violet/15 border-2 border-pg-violet/30 flex items-center justify-center text-pg-violet font-extrabold text-sm"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    {tokenSymbol?.slice(0, 2) || "??"}
                  </div>
                  <div>
                    <p className="font-bold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
                      {tokenSymbol || "Unknown Token"}
                    </p>
                    <p className="text-xs font-mono text-pg-muted">
                      {tokenAddress.slice(0, 10)}...{tokenAddress.slice(-6)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Creator benefits */}
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-pg-amber/15 border-2 border-pg-amber/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-pg-amber text-xs font-extrabold">$</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
                      Earn 0.5% forever
                    </p>
                    <p className="text-xs text-pg-muted leading-relaxed">
                      You earn 0.5% of every round{"'"}s betting pool for this token, permanently.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-pg-pink/15 border-2 border-pg-pink/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg
                      className="w-3.5 h-3.5 text-pg-pink"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
                      First round starts on first bet
                    </p>
                    <p className="text-xs text-pg-muted leading-relaxed">
                      Creating a market registers it. The first 5-minute round starts when someone places a bet.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-pg-pink/10 text-pg-pink text-xs font-bold rounded-xl px-4 py-2.5 mb-4 border-2 border-pg-pink/20">
                  {error}
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={isCreating}
                className="btn-candy w-full text-sm disabled:opacity-50"
              >
                {isCreating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="loading loading-spinner loading-sm" />
                    Creating market...
                  </span>
                ) : (
                  "Create"
                )}
              </button>

              <p className="text-[11px] text-pg-muted text-center mt-3">
                Requires a valid Uniswap V4 pool on Base. Round 1 begins on first bet.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
