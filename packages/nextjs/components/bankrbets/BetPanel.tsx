"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RoundTimer } from "./RoundTimer";
import { ShareButton } from "./ShareButton";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { formatUnits, parseSignature, parseUnits, toHex } from "viem";
import { base } from "viem/chains";
import { useAccount, useSignTypedData, useSwitchChain, useWriteContract } from "wagmi";
import {
  useClaimable,
  usePredictionActions,
  useSettlementActions,
  useSettlementStatus,
  useUserBet,
} from "~~/hooks/bankrbets/usePredictionContract";
import { useUsdcApproval } from "~~/hooks/bankrbets/useUsdcApproval";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { getWalletActionErrorMessage, notification } from "~~/utils/scaffold-eth";

interface BetPanelProps {
  tokenAddress: string;
  tokenSymbol?: string;
  lockPrice?: number;
  marketCreated?: boolean;
  epoch?: bigint;
  round?: any;
  isActive?: boolean;
}

const USDC_DECIMALS = 6;
const MIN_BET_AMOUNT_RAW = 1_000_000n; // 1 USDC with 6 decimals
const REFUND_GRACE_PERIOD_S = 60 * 60;
const AUTHORIZATION_WINDOW_S = 30 * 60;

const predictionAuthorizationAbi = [
  {
    type: "function",
    name: "betWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_token", type: "address" },
      { name: "_amount", type: "uint256" },
      { name: "_position", type: "uint8" },
      { name: "_validAfter", type: "uint256" },
      { name: "_validBefore", type: "uint256" },
      { name: "_nonce", type: "bytes32" },
      { name: "_v", type: "uint8" },
      { name: "_r", type: "bytes32" },
      { name: "_s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export function BetPanel({
  tokenAddress,
  tokenSymbol,
  lockPrice,
  marketCreated,
  epoch,
  round,
  isActive,
}: BetPanelProps) {
  const { address, chainId } = useAccount();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const { data: predictionContract } = useDeployedContractInfo("BankrBetsPrediction");
  const { signTypedDataAsync, isPending: isSigningAuthorization } = useSignTypedData();
  const { writeContractAsync: writeAuthorizedBet, isPending: isSubmittingAuthorizedBet } = useWriteContract();
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"bull" | "bear">("bull");
  const [submitAfterConnect, setSubmitAfterConnect] = useState(false);

  const currentEpoch = epoch;
  const currentRound = round;
  const currentIsActive = isActive ?? (currentEpoch !== undefined && currentEpoch > 0n);
  const userBet = useUserBet(tokenAddress, currentEpoch, address);
  const claimable = useClaimable(tokenAddress, currentEpoch, address);
  const { claim, refundRound, isClaiming, isRefunding } = usePredictionActions();
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

  const { hasBalance, balance, usdcAddress } = useUsdcApproval(betAmountRaw);

  const isWrongNetwork = address && chainId !== base.id;
  const isLocked = currentRound ? currentRound.locked : false;
  const lockTimestamp = currentRound ? Number(currentRound.lockTimestamp) : 0;
  const closeTimestamp = currentRound ? Number(currentRound.closeTimestamp) : 0;
  const hasBet = userBet && userBet.amount > 0n;
  const isBettingOpen =
    currentIsActive && currentRound && !isLocked && Math.floor(Date.now() / 1000) < Number(currentRound.lockTimestamp);
  const now = Math.floor(Date.now() / 1000);
  const canTriggerRefund = !!(
    currentRound &&
    !currentRound.oracleCalled &&
    Number(currentRound.closeTimestamp) > 0 &&
    now >= Number(currentRound.closeTimestamp) + REFUND_GRACE_PERIOD_S
  );
  const roundCancelled = !!(currentRound && currentRound.cancelled);
  // Market exists but no active round — first bet will auto-start one
  const canBetToStart = marketCreated === true && !currentIsActive;

  const totalPool = currentRound ? Number(currentRound.totalAmount) / 1e6 : 0;
  const bullPool = currentRound ? Number(currentRound.bullAmount) / 1e6 : 0;
  const bearPool = currentRound ? Number(currentRound.bearAmount) / 1e6 : 0;
  const bullPercent = totalPool > 0 ? (bullPool / totalPool) * 100 : 50;
  const bearPercent = totalPool > 0 ? (bearPool / totalPool) * 100 : 50;

  const isBetting = isSigningAuthorization || isSubmittingAuthorizedBet;
  const normalizedAmount = amount.trim();
  const hasAmountInput = normalizedAmount.length > 0;
  const isAmountValid = betAmountRaw > 0n;
  const isBelowMinimum = isAmountValid && betAmountRaw < MIN_BET_AMOUNT_RAW;
  const isBalanceInsufficient = isAmountValid && !isBelowMinimum && !hasBalance;
  const maxBetAmountInput = useMemo(() => {
    if (balance <= 0n) return "0";
    const formatted = formatUnits(balance, USDC_DECIMALS);
    return formatted.includes(".") ? formatted.replace(/\.?0+$/, "") : formatted;
  }, [balance]);

  const handleBet = useCallback(async () => {
    if (!address || !tokenAddress || !predictionContract?.address || !usdcAddress || betAmountRaw <= 0n) {
      return;
    }

    if (chainId !== base.id) {
      notification.warning(`Wrong network detected. Please switch to ${base.name}`);
      try {
        if (switchChainAsync) {
          await switchChainAsync({ chainId: base.id });
        }
      } catch (error) {
        notification.error(
          getWalletActionErrorMessage(error, {
            actionLabel: "Network switch",
            networkName: base.name,
          }),
        );
      }
      return;
    }

    const nowTs = Math.floor(Date.now() / 1000);
    const validAfter = BigInt(nowTs - 60);
    const validBefore = BigInt(nowTs + AUTHORIZATION_WINDOW_S);
    const nonceBytes = new Uint8Array(32);
    crypto.getRandomValues(nonceBytes);
    const nonce = toHex(nonceBytes);

    try {
      const signature = await signTypedDataAsync({
        account: address,
        domain: {
          name: "USD Coin",
          version: "2",
          chainId: base.id,
          verifyingContract: usdcAddress,
        },
        types: {
          ReceiveWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        primaryType: "ReceiveWithAuthorization",
        message: {
          from: address,
          to: predictionContract.address,
          value: betAmountRaw,
          validAfter,
          validBefore,
          nonce,
        },
      });

      const { v, r, s } = parseSignature(signature);
      if (v === undefined || !r || !s) {
        throw new Error("Invalid USDC authorization signature");
      }
      const vAsNumber = Number(v);
      const position = direction === "bull" ? 0 : 1;
      await writeAuthorizedBet({
        address: predictionContract.address,
        abi: predictionAuthorizationAbi,
        functionName: "betWithAuthorization",
        args: [tokenAddress, betAmountRaw, position, validAfter, validBefore, nonce, vAsNumber, r, s],
      });
      setAmount("");
      setDirection("bull");
    } catch (e) {
      notification.error(
        getWalletActionErrorMessage(e, {
          actionLabel: "Bet",
          networkName: base.name,
          fallback: "Unable to place bet",
        }),
      );
      console.error("Bet failed:", e);
    }
  }, [
    address,
    betAmountRaw,
    chainId,
    direction,
    switchChainAsync,
    predictionContract?.address,
    signTypedDataAsync,
    tokenAddress,
    usdcAddress,
    writeAuthorizedBet,
  ]);

  const handleClaim = useCallback(async () => {
    if (!currentEpoch) return;
    try {
      await claim(tokenAddress, [currentEpoch]);
    } catch (e) {
      console.error("Claim failed:", e);
    }
  }, [currentEpoch, tokenAddress, claim]);

  const handleRefundTrigger = useCallback(async () => {
    if (!currentEpoch) return;
    try {
      await refundRound(tokenAddress, currentEpoch);
    } catch (e) {
      console.error("Refund trigger failed:", e);
    }
  }, [currentEpoch, tokenAddress, refundRound]);

  const handleSettle = useCallback(async () => {
    try {
      if (isLockable) await lockRound(tokenAddress);
      else if (isClosable) await closeRound(tokenAddress);
    } catch (e) {
      console.error("Settlement failed:", e);
    }
  }, [isLockable, isClosable, tokenAddress, lockRound, closeRound]);

  const handleSetMaxAmount = useCallback(() => {
    setAmount(maxBetAmountInput);
  }, [maxBetAmountInput]);

  const handleConnectAndSubmit = useCallback(() => {
    if (!openConnectModal) return;
    setSubmitAfterConnect(true);
    openConnectModal();
  }, [openConnectModal]);

  const handleSwitchToBase = useCallback(async () => {
    if (!switchChainAsync) return;
    try {
      await switchChainAsync({ chainId: base.id });
    } catch (error) {
      notification.error(
        getWalletActionErrorMessage(error, {
          actionLabel: "Network switch",
          networkName: base.name,
        }),
      );
    }
  }, [switchChainAsync]);

  useEffect(() => {
    if (!submitAfterConnect || !address) return;
    if (isWrongNetwork || isSwitching || isBetting) return;
    if (!isAmountValid || isBelowMinimum || isBalanceInsufficient) return;

    setSubmitAfterConnect(false);
    void handleBet();
  }, [
    address,
    handleBet,
    isAmountValid,
    isBalanceInsufficient,
    isBelowMinimum,
    isBetting,
    isSwitching,
    isWrongNetwork,
    submitAfterConnect,
  ]);

  type ActionTone = "neutral" | "amber" | "violet" | "mint" | "pink";
  const actionState = useMemo(() => {
    if (!address) {
      return {
        label: "Connect wallet to bet",
        onClick: handleConnectAndSubmit,
        disabled: !openConnectModal,
        tone: "violet" as ActionTone,
        loading: false,
      };
    }

    if (isWrongNetwork) {
      return {
        label: isSwitching ? "Switching to Base..." : "Switch to Base",
        onClick: handleSwitchToBase,
        disabled: isSwitching,
        tone: "amber" as ActionTone,
        loading: isSwitching,
      };
    }

    if (!hasAmountInput) {
      return {
        label: "Enter amount",
        disabled: true,
        tone: "neutral" as ActionTone,
        loading: false,
      };
    }

    if (!isAmountValid) {
      return {
        label: "Enter a valid amount",
        disabled: true,
        tone: "neutral" as ActionTone,
        loading: false,
      };
    }

    if (isBelowMinimum) {
      return {
        label: "Minimum bet is $1 USDC",
        disabled: true,
        tone: "neutral" as ActionTone,
        loading: false,
      };
    }

    if (isBalanceInsufficient) {
      return {
        label: "Insufficient USDC balance",
        disabled: true,
        tone: "neutral" as ActionTone,
        loading: false,
      };
    }

    if (isBetting) {
      return {
        label: isSigningAuthorization ? "Sign USDC authorization..." : "Placing bet...",
        disabled: true,
        tone: direction === "bull" ? ("mint" as ActionTone) : ("pink" as ActionTone),
        loading: true,
      };
    }

    return {
      label: `Bet ${direction === "bull" ? "↑ UP" : "↓ DOWN"}${hasAmountInput ? ` · $${normalizedAmount}` : ""}`,
      onClick: handleBet,
      disabled: false,
      tone: direction === "bull" ? ("mint" as ActionTone) : ("pink" as ActionTone),
      loading: false,
    };
  }, [
    address,
    direction,
    handleBet,
    handleConnectAndSubmit,
    hasAmountInput,
    isAmountValid,
    isBalanceInsufficient,
    isBelowMinimum,
    isBetting,
    isSigningAuthorization,
    isSwitching,
    isWrongNetwork,
    normalizedAmount,
    openConnectModal,
    handleSwitchToBase,
  ]);

  const actionButtonClassName = useMemo(() => {
    const baseButtonClass =
      "w-full py-3 rounded-xl font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
    switch (actionState.tone) {
      case "amber":
        return `${baseButtonClass} bg-pg-amber hover:bg-pg-amber/90 text-white`;
      case "violet":
        return `${baseButtonClass} bg-pg-violet hover:bg-pg-violet/90 text-white`;
      case "mint":
        return `${baseButtonClass} bg-pg-mint hover:bg-pg-mint/90 text-white`;
      case "pink":
        return `${baseButtonClass} bg-pg-pink hover:bg-pg-pink/90 text-white`;
      default:
        return `${baseButtonClass} bg-base-200 text-pg-muted`;
    }
  }, [actionState.tone]);

  // No active round and no market (or still loading) — show empty state
  if (!currentIsActive && !canBetToStart) {
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
                onClick={() => setDirection("bull")}
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
                onClick={() => setDirection("bear")}
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
                  <span className="text-[11px] text-pg-muted/60 font-mono">
                    Balance ${(Number(balance) / 1e6).toFixed(2)}
                  </span>
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

              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="1"
                  step="0.01"
                  className="w-full bg-base-200/50 border-2 border-pg-border rounded-xl px-3 py-2.5 pr-16 text-base font-mono focus:outline-none focus:border-pg-violet/50 transition-colors"
                />
                <button
                  type="button"
                  onClick={handleSetMaxAmount}
                  disabled={!address || balance <= 0n}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md border border-pg-violet/40 bg-pg-violet/10 text-[11px] font-bold tracking-wide text-pg-violet hover:bg-pg-violet/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Action */}
            <button
              onClick={actionState.onClick ? () => void actionState.onClick?.() : undefined}
              disabled={actionState.disabled}
              className={actionButtonClassName}
            >
              {actionState.loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="loading loading-spinner loading-sm" />
                  {actionState.label}
                </span>
              ) : (
                actionState.label
              )}
            </button>

            {/* Footer */}
            <div className="pt-3 border-t-2 border-pg-border/40 flex items-center justify-between text-[10px] text-pg-muted/50">
              {lockPrice && lockPrice > 0 ? (
                <span className="font-mono">Lock ${lockPrice.toFixed(5)}</span>
              ) : (
                <span>Round #{currentEpoch?.toString()}</span>
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
