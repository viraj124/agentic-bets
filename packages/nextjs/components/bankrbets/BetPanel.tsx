"use client";

import { useCallback, useMemo, useState } from "react";
import { ShareButton } from "./ShareButton";
import { parseUnits } from "viem";
import { base } from "viem/chains";
import { useAccount, useSwitchChain } from "wagmi";
import {
  useCurrentRound,
  usePredictionActions,
  useSettlementActions,
  useSettlementStatus,
  useUserBet,
} from "~~/hooks/bankrbets/usePredictionContract";
import { useUsdcApproval } from "~~/hooks/bankrbets/useUsdcApproval";

interface BetPanelProps {
  tokenAddress: string;
  tokenSymbol?: string;
}

const USDC_DECIMALS = 6;

export function BetPanel({ tokenAddress, tokenSymbol }: BetPanelProps) {
  const { address, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [amount, setAmount] = useState("");
  const { epoch, round, isActive } = useCurrentRound(tokenAddress);
  const userBet = useUserBet(tokenAddress, epoch, address);
  const { betBull, betBear, isBettingBull, isBettingBear } = usePredictionActions();
  const { lockRound, closeRound, isLocking, isClosing } = useSettlementActions();
  const { isLockable, isClosable, settlerReward } = useSettlementStatus(tokenAddress);

  const betAmountRaw = useMemo(() => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return 0n;
    try {
      return parseUnits(amount, USDC_DECIMALS);
    } catch {
      return 0n;
    }
  }, [amount]);

  const { needsApproval, hasBalance, approve, isApproving, balance } = useUsdcApproval(betAmountRaw);

  const isWrongNetwork = address && chainId !== base.id;

  const hasBet = userBet && userBet[1] > 0n;
  const isBettingOpen = isActive && round && !round[11] && Math.floor(Date.now() / 1000) < Number(round[3]);

  const totalPool = round ? Number(round[6]) / 1e6 : 0;
  const bullPool = round ? Number(round[7]) / 1e6 : 0;
  const bearPool = round ? Number(round[8]) / 1e6 : 0;
  const bullPercent = totalPool > 0 ? (bullPool / totalPool) * 100 : 50;
  const bearPercent = totalPool > 0 ? (bearPool / totalPool) * 100 : 50;

  const handleBet = useCallback(
    async (direction: "bull" | "bear") => {
      if (!amount || !tokenAddress) return;
      const amountRaw = parseUnits(amount, USDC_DECIMALS);

      try {
        if (direction === "bull") {
          await betBull(tokenAddress, amountRaw);
        } else {
          await betBear(tokenAddress, amountRaw);
        }
        setAmount("");
      } catch (e) {
        console.error("Bet failed:", e);
      }
    },
    [amount, tokenAddress, betBull, betBear],
  );

  const handleApprove = useCallback(async () => {
    try {
      await approve();
    } catch (e) {
      console.error("Approval failed:", e);
    }
  }, [approve]);

  const handleSettle = useCallback(async () => {
    try {
      if (isLockable) {
        await lockRound(tokenAddress);
      } else if (isClosable) {
        await closeRound(tokenAddress);
      }
    } catch (e) {
      console.error("Settlement failed:", e);
    }
  }, [isLockable, isClosable, tokenAddress, lockRound, closeRound]);

  const handleBetBull = useCallback(() => handleBet("bull"), [handleBet]);
  const handleBetBear = useCallback(() => handleBet("bear"), [handleBet]);

  if (!isActive) {
    return (
      <div className="bg-base-100 rounded-xl border border-base-300/60 p-6">
        <div className="text-center py-6">
          <div className="w-12 h-12 rounded-full bg-base-200 flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-6 h-6 text-base-content/30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-base-content/60">No active round</p>
          <p className="text-xs text-base-content/40 mt-1">Waiting for the next round to start</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-base-100 rounded-xl border border-base-300/60 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-base-300/60 flex items-center justify-between">
        <span className="text-sm font-semibold">Round #{epoch?.toString()}</span>
        {round?.[11] ? (
          <span className="text-xs font-medium text-warning bg-warning/10 px-2 py-0.5 rounded-full">Locked</span>
        ) : (
          <span className="text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded-full">Open</span>
        )}
      </div>

      <div className="p-5">
        {/* Pool sentiment */}
        <div className="mb-5">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="font-medium text-success">UP {bullPercent.toFixed(0)}%</span>
            <span className="text-base-content/40">${totalPool.toFixed(2)} pool</span>
            <span className="font-medium text-error">{bearPercent.toFixed(0)}% DOWN</span>
          </div>
          <div className="w-full h-1.5 bg-error/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-success rounded-full transition-all duration-500"
              style={{ width: `${bullPercent}%` }}
            />
          </div>
        </div>

        {/* Settlement button */}
        {(isLockable || isClosable) && (
          <button
            onClick={handleSettle}
            disabled={isLocking || isClosing}
            className="w-full mb-4 py-2.5 rounded-lg font-semibold text-sm bg-warning hover:bg-warning/90 text-white disabled:opacity-50 transition-colors"
          >
            {isLocking || isClosing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="loading loading-spinner loading-sm" />
                Settling...
              </span>
            ) : (
              <>
                {isLockable ? "Lock Round" : "Settle Round"}
                {settlerReward > 0 ? ` \u2014 Earn $${settlerReward.toFixed(2)}` : ""}
              </>
            )}
          </button>
        )}

        {hasBet ? (
          <div className="text-center py-5 bg-base-200/50 rounded-lg">
            <p className="text-xs text-base-content/50 mb-1">Your bet</p>
            <p className="text-xl font-bold">
              ${(Number(userBet![1]) / 1e6).toFixed(2)}{" "}
              <span className={userBet![0] === 0 ? "text-success" : "text-error"}>
                {userBet![0] === 0 ? "UP" : "DOWN"}
              </span>
            </p>
            <p className="text-xs text-base-content/40 mt-2">Waiting for settlement...</p>
            <div className="mt-3">
              <ShareButton
                message={`I just bet $${(Number(userBet![1]) / 1e6).toFixed(2)} ${userBet![0] === 0 ? "UP" : "DOWN"} on ${tokenSymbol || "a token"} on BankrBets!`}
              />
            </div>
          </div>
        ) : isBettingOpen ? (
          <>
            {/* Amount input */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-base-content/50">Amount (USDC)</label>
                {address && (
                  <span className="text-[11px] text-base-content/40">
                    Balance: ${(Number(balance) / 1e6).toFixed(2)}
                  </span>
                )}
              </div>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                min="1"
                step="1"
                className="w-full bg-base-200/50 border border-base-300/60 rounded-lg px-3 py-2.5 text-base font-mono focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors"
              />
              <div className="flex gap-1.5 mt-2">
                {[5, 10, 25, 50].map(v => (
                  <button
                    key={v}
                    onClick={() => setAmount(v.toString())}
                    className={`flex-1 text-xs py-1.5 rounded-md border transition-colors ${
                      amount === v.toString()
                        ? "border-primary bg-primary/5 text-primary font-medium"
                        : "border-base-300/60 text-base-content/50 hover:border-base-content/20"
                    }`}
                  >
                    ${v}
                  </button>
                ))}
              </div>
            </div>

            {/* Three-Button Flow */}
            {!address ? (
              <p className="text-center text-sm text-base-content/50 py-2">Connect wallet to bet</p>
            ) : isWrongNetwork ? (
              <button
                onClick={() => switchChain({ chainId: base.id })}
                disabled={isSwitching}
                className="w-full py-3 rounded-lg font-semibold text-sm bg-warning hover:bg-warning/90 text-white disabled:opacity-50 transition-colors"
              >
                {isSwitching ? <span className="loading loading-spinner loading-sm" /> : "Switch to Base"}
              </button>
            ) : !hasBalance && betAmountRaw > 0n ? (
              <button
                disabled
                className="w-full py-3 rounded-lg font-semibold text-sm bg-base-300 text-base-content/40 cursor-not-allowed"
              >
                Insufficient USDC balance
              </button>
            ) : needsApproval && betAmountRaw > 0n ? (
              <button
                onClick={handleApprove}
                disabled={isApproving}
                className="w-full py-3 rounded-lg font-semibold text-sm bg-primary hover:bg-primary/90 text-primary-content disabled:opacity-50 transition-colors"
              >
                {isApproving ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="loading loading-spinner loading-sm" />
                    Approving...
                  </span>
                ) : (
                  "Approve USDC"
                )}
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={handleBetBull}
                  disabled={isBettingBull || !amount}
                  className="py-3 rounded-lg font-semibold text-sm bg-success hover:bg-success/90 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isBettingBull ? <span className="loading loading-spinner loading-sm" /> : "UP"}
                </button>
                <button
                  onClick={handleBetBear}
                  disabled={isBettingBear || !amount}
                  className="py-3 rounded-lg font-semibold text-sm bg-error hover:bg-error/90 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isBettingBear ? <span className="loading loading-spinner loading-sm" /> : "DOWN"}
                </button>
              </div>
            )}

            {/* Fee breakdown */}
            <div className="mt-3 pt-3 border-t border-base-300/40">
              <div className="flex justify-between text-[11px] text-base-content/35">
                <span>1.5% treasury + 0.5% creator + 0.1% settler</span>
                <span>2.1% total</span>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-5 bg-base-200/50 rounded-lg">
            <p className="text-sm text-base-content/50">Betting closed</p>
            <p className="text-xs text-base-content/40 mt-1">Waiting for round to settle</p>
          </div>
        )}
      </div>
    </div>
  );
}
