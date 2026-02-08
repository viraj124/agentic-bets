"use client";

import { useState } from "react";
import { useCreateMarket } from "~~/hooks/bankrbets/useCreateMarket";

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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleCreate = async () => {
    setError(null);
    try {
      await createMarket(tokenAddress, poolAddress);
      setSuccess(true);
      onSuccess?.();
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || "Transaction failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-base-100 rounded-2xl border border-base-300/60 shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-base-300/60 flex items-center justify-between">
          <h3 className="text-lg font-bold">Create Prediction Market</h3>
          <button onClick={onClose} className="text-base-content/30 hover:text-base-content/60 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {success ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                <svg
                  className="w-7 h-7 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="font-semibold text-lg mb-1">Market created!</p>
              <p className="text-sm text-base-content/50">
                You{"'"}ll earn 0.5% of every round{"'"}s pool as the market creator.
              </p>
              <button
                onClick={onClose}
                className="mt-5 px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Start betting
              </button>
            </div>
          ) : (
            <>
              {/* Token info */}
              <div className="bg-base-200/50 rounded-lg p-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {tokenSymbol?.slice(0, 2) || "??"}
                  </div>
                  <div>
                    <p className="font-semibold">{tokenSymbol || "Unknown Token"}</p>
                    <p className="text-xs font-mono text-base-content/40">
                      {tokenAddress.slice(0, 10)}...{tokenAddress.slice(-6)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Creator benefits */}
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-primary text-xs font-bold">$</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Earn 0.5% forever</p>
                    <p className="text-xs text-base-content/50">
                      You earn 0.5% of every round{"'"}s betting pool for this token, permanently.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg
                      className="w-3 h-3 text-primary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium">First round starts immediately</p>
                    <p className="text-xs text-base-content/50">
                      A 5-minute prediction round begins as soon as the market is created.
                    </p>
                  </div>
                </div>
              </div>

              {error && <div className="bg-red-50 text-red-600 text-xs rounded-lg px-3 py-2 mb-4">{error}</div>}

              <button
                onClick={handleCreate}
                disabled={isCreating}
                className="w-full py-3 rounded-lg font-semibold text-sm bg-primary hover:bg-primary/90 text-white disabled:opacity-50 transition-colors"
              >
                {isCreating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="loading loading-spinner loading-sm" />
                    Creating market...
                  </span>
                ) : (
                  "Create Market & Start Round"
                )}
              </button>

              <p className="text-[11px] text-base-content/30 text-center mt-3">
                Requires a valid Uniswap V4 pool on Base
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
