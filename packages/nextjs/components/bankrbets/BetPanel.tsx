"use client";

import { useCallback, useMemo, useState } from "react";
import { RoundTimer } from "./RoundTimer";
import { ShareButton } from "./ShareButton";
import { parseUnits } from "viem";
import { base } from "viem/chains";
import { useAccount, useSwitchChain } from "wagmi";
import {
  useClaimable,
  useCurrentRound,
  usePredictionActions,
  useRefundStatus,
  useSettlementActions,
  useSettlementStatus,
  useUserBet,
} from "~~/hooks/bankrbets/usePredictionContract";
import { useUsdcApproval } from "~~/hooks/bankrbets/useUsdcApproval";

interface BetPanelProps {
  tokenAddress: string;
  tokenSymbol?: string;
  lockPrice?: number;
  marketCreated?: boolean;
}

const USDC_DECIMALS = 6;

export function BetPanel({ tokenAddress, tokenSymbol, lockPrice, marketCreated }: BetPanelProps) {
  const { address, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"bull" | "bear" | null>(null);

  const { epoch, round, isActive } = useCurrentRound(tokenAddress);
  const userBet = useUserBet(tokenAddress, epoch, address);
  const claimable = useClaimable(tokenAddress, epoch, address);
  const { canTriggerRefund, roundCancelled } = useRefundStatus(tokenAddress);
  const { betBull, betBear, claim, refundRound, isBettingBull, isBettingBear, isClaiming, isRefunding } =
    usePredictionActions();
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
  const isLocked = round ? round.locked : false;
  const lockTimestamp = round ? Number(round.lockTimestamp) : 0;
  const closeTimestamp = round ? Number(round.closeTimestamp) : 0;
  const hasBet = userBet && userBet.amount > 0n;
  const isBettingOpen = isActive && round && !isLocked && Math.floor(Date.now() / 1000) < Number(round.lockTimestamp);
  // Market exists but no active round — first bet will auto-start one
  const canBetToStart = marketCreated === true && !isActive;

  const totalPool = round ? Number(round.totalAmount) / 1e6 : 0;
  const bullPool = round ? Number(round.bullAmount) / 1e6 : 0;
  const bearPool = round ? Number(round.bearAmount) / 1e6 : 0;
  const bullPercent = totalPool > 0 ? (bullPool / totalPool) * 100 : 50;
  const bearPercent = totalPool > 0 ? (bearPool / totalPool) * 100 : 50;

  const isBetting = direction === "bull" ? isBettingBull : isBettingBear;

  const handleBet = useCallback(async () => {
    if (!amount || !tokenAddress || !direction) return;
    const amountRaw = parseUnits(amount, USDC_DECIMALS);
    try {
      if (direction === "bull") {
        await betBull(tokenAddress, amountRaw);
      } else {
        await betBear(tokenAddress, amountRaw);
      }
      setAmount("");
      setDirection(null);
    } catch (e) {
      console.error("Bet failed:", e);
    }
  }, [amount, tokenAddress, direction, betBull, betBear]);

  const handleClaim = useCallback(async () => {
    if (!epoch) return;
    try {
      await claim(tokenAddress, [epoch]);
    } catch (e) {
      console.error("Claim failed:", e);
    }
  }, [epoch, tokenAddress, claim]);

  const handleRefundTrigger = useCallback(async () => {
    if (!epoch) return;
    try {
      await refundRound(tokenAddress, epoch);
    } catch (e) {
      console.error("Refund trigger failed:", e);
    }
  }, [epoch, tokenAddress, refundRound]);

  const handleApprove = useCallback(async () => {
    try {
      await approve();
    } catch (e) {
      console.error("Approval failed:", e);
    }
  }, [approve]);

  const handleSettle = useCallback(async () => {
    try {
      if (isLockable) await lockRound(tokenAddress);
      else if (isClosable) await closeRound(tokenAddress);
    } catch (e) {
      console.error("Settlement failed:", e);
    }
  }, [isLockable, isClosable, tokenAddress, lockRound, closeRound]);

  // No active round and no market (or still loading) — show empty state
  if (!isActive && !canBetToStart) {
    const isLoading = marketCreated === undefined;

    return (
      <div className="bg-base-100 rounded-2xl border-2 border-pg-border p-8 text-center">
        <div className="w-10 h-10 rounded-full bg-base-200 flex items-center justify-center mx-auto mb-3">
          {isLoading ? (
            <span className="loading loading-spinner loading-sm text-pg-muted/40" />
          ) : (
            <svg
              className="w-5 h-5 text-pg-muted/40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          )}
        </div>
        {isLoading ? (
          <p className="text-sm font-bold text-pg-muted">Loading...</p>
        ) : (
          <>
            <p className="text-sm font-bold text-pg-muted">No market yet</p>
            <p className="text-xs text-pg-muted/50 mt-1">Create a market to start predicting</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-base-100 rounded-2xl border-2 border-pg-border overflow-hidden">
      {/* Countdown */}
      {(lockTimestamp > 0 || closeTimestamp > 0) && (
        <div className="px-5 py-4 border-b-2 border-pg-border bg-base-200/30 text-center">
          <RoundTimer lockTimestamp={lockTimestamp} closeTimestamp={closeTimestamp} isLocked={Boolean(isLocked)} />
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Settlement */}
        {(isLockable || isClosable) && (
          <button
            onClick={handleSettle}
            disabled={isLocking || isClosing}
            className="w-full py-2.5 rounded-xl font-bold text-sm bg-pg-amber hover:bg-pg-amber/90 text-white disabled:opacity-50 transition-colors"
          >
            {isLocking || isClosing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="loading loading-spinner loading-sm" />
                Settling...
              </span>
            ) : (
              `${isLockable ? "Lock Round" : "Settle Round"}${settlerReward > 0 ? ` — Earn $${settlerReward.toFixed(2)}` : ""}`
            )}
          </button>
        )}

        {/* Start-round banner */}
        {canBetToStart && (
          <div className="rounded-xl bg-pg-violet/10 border border-pg-violet/20 px-3 py-2 text-center">
            <p className="text-xs font-bold text-pg-violet">Your bet will start the next round</p>
          </div>
        )}

        {/* Trigger refund — anyone can call this to unlock stuck rounds */}
        {canTriggerRefund && (
          <button
            onClick={handleRefundTrigger}
            disabled={isRefunding}
            className="w-full py-2.5 rounded-xl font-bold text-sm bg-pg-pink/15 hover:bg-pg-pink/25 text-pg-pink border-2 border-pg-pink/30 disabled:opacity-50 transition-colors"
          >
            {isRefunding ? (
              <span className="flex items-center justify-center gap-2">
                <span className="loading loading-spinner loading-sm" />
                Triggering...
              </span>
            ) : (
              "Trigger Refund — Round Expired"
            )}
          </button>
        )}

        {hasBet ? (
          /* Existing position */
          <div className="py-4 text-center">
            <p className="text-[10px] font-bold text-pg-muted uppercase tracking-widest mb-2">Your position</p>
            <p className="text-3xl font-extrabold font-mono" style={{ fontFamily: "var(--font-heading)" }}>
              ${(Number(userBet!.amount) / 1e6).toFixed(2)}
            </p>
            <span
              className={`inline-block mt-1.5 px-3 py-0.5 rounded-full text-sm font-bold border ${
                userBet!.position === 0
                  ? "bg-pg-mint/15 text-pg-mint border-pg-mint/30"
                  : "bg-pg-pink/15 text-pg-pink border-pg-pink/30"
              }`}
            >
              {userBet!.position === 0 ? "↑ UP" : "↓ DOWN"}
            </span>

            {/* Claim winnings */}
            {claimable ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-bold text-pg-mint">You won! Claim your USDC.</p>
                <button
                  onClick={handleClaim}
                  disabled={isClaiming}
                  className="w-full py-2.5 rounded-xl font-bold text-sm bg-pg-mint hover:bg-pg-mint/90 text-white disabled:opacity-50 transition-colors"
                >
                  {isClaiming ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="loading loading-spinner loading-sm" />
                      Claiming...
                    </span>
                  ) : roundCancelled ? (
                    "Claim Refund"
                  ) : (
                    "Claim Winnings"
                  )}
                </button>
              </div>
            ) : roundCancelled ? (
              <div className="mt-4 space-y-1">
                <p className="text-xs font-bold text-pg-amber">Round cancelled — your bet will be refunded.</p>
                <button
                  onClick={handleClaim}
                  disabled={isClaiming}
                  className="w-full py-2.5 rounded-xl font-bold text-sm bg-pg-amber hover:bg-pg-amber/90 text-white disabled:opacity-50 transition-colors"
                >
                  {isClaiming ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="loading loading-spinner loading-sm" />
                      Claiming...
                    </span>
                  ) : (
                    "Claim Refund"
                  )}
                </button>
              </div>
            ) : (
              <p className="text-xs text-pg-muted/50 mt-3">Waiting for settlement</p>
            )}

            {!claimable && !roundCancelled && (
              <div className="mt-4">
                <ShareButton
                  message={`I just bet $${(Number(userBet!.amount) / 1e6).toFixed(2)} ${userBet!.position === 0 ? "UP" : "DOWN"} on ${tokenSymbol || "a token"} on BankrBets!`}
                />
              </div>
            )}
          </div>
        ) : isBettingOpen || canBetToStart ? (
          <>
            {/* Outcome buttons */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setDirection(d => (d === "bull" ? null : "bull"))}
                className={`p-3.5 rounded-xl border-2 text-left transition-all ${
                  direction === "bull"
                    ? "border-pg-mint bg-pg-mint/10"
                    : "border-pg-border hover:border-pg-mint/40 bg-base-200/30"
                }`}
              >
                <p className="text-[11px] font-bold text-pg-mint mb-1">↑ UP</p>
                <p className="text-2xl font-extrabold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
                  {bullPercent.toFixed(0)}%
                </p>
                <p className="text-[11px] text-pg-muted mt-0.5">${bullPool.toFixed(0)} pool</p>
              </button>

              <button
                onClick={() => setDirection(d => (d === "bear" ? null : "bear"))}
                className={`p-3.5 rounded-xl border-2 text-left transition-all ${
                  direction === "bear"
                    ? "border-pg-pink bg-pg-pink/10"
                    : "border-pg-border hover:border-pg-pink/40 bg-base-200/30"
                }`}
              >
                <p className="text-[11px] font-bold text-pg-pink mb-1">↓ DOWN</p>
                <p className="text-2xl font-extrabold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
                  {bearPercent.toFixed(0)}%
                </p>
                <p className="text-[11px] text-pg-muted mt-0.5">${bearPool.toFixed(0)} pool</p>
              </button>
            </div>

            {/* Pool bar */}
            {!canBetToStart && (
              <div className="w-full h-1 bg-pg-pink/25 rounded-full overflow-hidden -mt-1">
                <div
                  className="h-full bg-pg-mint rounded-full transition-all duration-500"
                  style={{ width: `${bullPercent}%` }}
                />
              </div>
            )}

            {/* Amount */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-pg-muted uppercase tracking-widest">Amount (USDC)</span>
                {address && (
                  <span className="text-[11px] text-pg-muted/60 font-mono">${(Number(balance) / 1e6).toFixed(2)}</span>
                )}
              </div>

              <div className="flex gap-1.5 mb-2">
                {[5, 10, 25, 50].map(v => (
                  <button
                    key={v}
                    onClick={() => setAmount(v.toString())}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border-2 transition-all ${
                      amount === v.toString()
                        ? "border-pg-violet bg-pg-violet/10 text-pg-violet"
                        : "border-pg-border text-pg-muted hover:border-pg-violet/30"
                    }`}
                  >
                    ${v}
                  </button>
                ))}
              </div>

              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                min="1"
                step="1"
                className="w-full bg-base-200/50 border-2 border-pg-border rounded-xl px-3 py-2.5 text-base font-mono focus:outline-none focus:border-pg-violet/50 transition-colors"
              />
            </div>

            {/* Action */}
            {!address ? (
              <p className="text-center text-sm text-pg-muted py-1">Connect wallet to bet</p>
            ) : isWrongNetwork ? (
              <button
                onClick={() => switchChain({ chainId: base.id })}
                disabled={isSwitching}
                className="w-full py-3 rounded-xl font-bold text-sm bg-pg-amber hover:bg-pg-amber/90 text-white disabled:opacity-50 transition-colors"
              >
                {isSwitching ? <span className="loading loading-spinner loading-sm" /> : "Switch to Base"}
              </button>
            ) : !hasBalance && betAmountRaw > 0n ? (
              <button
                disabled
                className="w-full py-3 rounded-xl font-bold text-sm bg-base-200 text-pg-muted cursor-not-allowed"
              >
                Insufficient USDC
              </button>
            ) : needsApproval && betAmountRaw > 0n ? (
              <button
                onClick={handleApprove}
                disabled={isApproving}
                className="w-full py-3 rounded-xl font-bold text-sm bg-pg-violet hover:bg-pg-violet/90 text-white disabled:opacity-50 transition-colors"
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
              <button
                onClick={handleBet}
                disabled={!direction || !amount || isBetting}
                className={`w-full py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  !direction
                    ? "bg-base-300 text-pg-muted"
                    : direction === "bull"
                      ? "bg-pg-mint hover:bg-pg-mint/90"
                      : "bg-pg-pink hover:bg-pg-pink/90"
                }`}
              >
                {isBetting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="loading loading-spinner loading-sm" />
                    Betting...
                  </span>
                ) : !direction ? (
                  "Select UP or DOWN"
                ) : (
                  `Bet ${direction === "bull" ? "↑ UP" : "↓ DOWN"}${amount ? ` · $${amount}` : ""}`
                )}
              </button>
            )}

            {/* Footer */}
            <div className="pt-3 border-t-2 border-pg-border/40 flex items-center justify-between text-[10px] text-pg-muted/50">
              {lockPrice && lockPrice > 0 ? (
                <span className="font-mono">Lock ${lockPrice.toFixed(5)}</span>
              ) : (
                <span>Round #{epoch?.toString()}</span>
              )}
              <span>2.1% fee</span>
            </div>
          </>
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm font-bold text-pg-muted">Betting closed</p>
            <p className="text-xs text-pg-muted/50 mt-1">Waiting for settlement</p>
          </div>
        )}
      </div>
    </div>
  );
}
