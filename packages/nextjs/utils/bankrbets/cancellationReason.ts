/**
 * Derive a human-readable cancellation reason from on-chain round data.
 * Mirrors the cancellation paths in BankrBetsPrediction.executeRound(),
 * _betInternal() auto-cancel, and refundRound().
 */
export function getCancellationReason(round: {
  totalAmount: bigint;
  bullAmount: bigint;
  bearAmount: bigint;
  lockPrice: bigint;
  closePrice: bigint;
  locked: boolean;
  oracleCalled: boolean;
  cancelled: boolean;
  rewardBaseCalAmount: bigint;
}): string | null {
  if (!round.cancelled) return null;

  // Auto-cancelled: round was never locked (lock window expired)
  if (!round.locked) return "Lock window expired — no one triggered the lock in time";

  // Locked but never executed (closePrice stays 0) → manual refund after grace period
  if (round.closePrice === 0n) return "Round was refunded after the settlement grace period";

  // Went through executeRound() — check specific paths in order:
  if (round.totalAmount === 0n) return "No bets were placed this round";

  if (round.lockPrice === 0n) return "Price feed was unavailable at lock time";

  // Circuit breaker: price moved >50%
  const lockPrice = round.lockPrice < 0n ? -round.lockPrice : round.lockPrice;
  const closePrice = round.closePrice < 0n ? -round.closePrice : round.closePrice;
  if (lockPrice > 0n) {
    const move = closePrice > lockPrice ? closePrice - lockPrice : lockPrice - closePrice;
    const moveBps = (move * 10000n) / lockPrice;
    if (moveBps > 5000n) {
      const pct = Number(moveBps) / 100;
      return `Price moved ${pct.toFixed(1)}% — circuit breaker cancelled the round`;
    }
  }

  // Tie
  if (round.closePrice === round.lockPrice) return "Price was unchanged — round tied";

  // No winners on the winning side
  if (round.rewardBaseCalAmount === 0n && round.totalAmount > 0n) {
    const priceWentDown = round.closePrice < round.lockPrice;
    if (priceWentDown && round.bearAmount === 0n) {
      return "Price went down but all bets were UP — no winners to pay out";
    }
    if (!priceWentDown && round.bullAmount === 0n) {
      return "Price went up but all bets were DOWN — no winners to pay out";
    }
    return "No bets on the winning side";
  }

  return "Round was cancelled";
}
