// Pure points engine for Season 1.
// No network, no Date.now() — given the same inputs it always produces the same outputs.

export type Position = 0 | 1; // 0 = bull, 1 = bear

export type RoundStatus = "settled" | "cancelled" | "refunded";

export type RoundSettlement = {
  status: RoundStatus;
  settledAt: number; // unix seconds; 0 if not yet known (pending)
};

export type BetEventInput = {
  user: string;
  roundId: string; // matches RoundSettlement id, e.g. `${contract}:${token}:${epoch}`
  contractAddress?: string; // 0x-prefixed lowercase; populated by data layer when available
  contractVersion?: "v1" | "v2";
  token: string; // 0x-prefixed lowercase
  epoch: number;
  amount: bigint; // raw USDC, 6 decimals
  placedAt: number; // unix seconds
  position: Position;
};

// Machine-readable codes for downstream export, dispute review, and Merkle prep.
export type ExclusionCode =
  | "outside_season_window"
  | "round_not_settled"
  | "cancelled_round"
  | "below_min_bet"
  | "opposite_side_same_round"
  | "wallet_blocklisted"
  | "manual_review_exclusion";

export type SeasonConfig = {
  startUnix: number;
  endUnix: number; // exclusive
  minBetUSDC: bigint; // 6dp
  dailyCapUSDC: bigint; // 6dp, per wallet per UTC day
  firstBetThresholdUSDC: bigint; // 6dp; cumulative eligible volume needed to unlock bonus
  firstBetBonusPoints: number;
  pointsPerDollar: number;
};

export type WalletReviewStatus = "ok" | "review" | "excluded";

export type WalletPoints = {
  user: string;
  seasonPoints: number;
  baseVolumePoints: number;
  firstBetBonusPoints: number;
  eligibleVolumeUSD: number;
  rawVolumeUSD: number;
  cappedVolumeUSD: number; // amount removed by daily cap
  excludedBets: number;
  exclusionReasons: string[];
  firstBetUnlocked: boolean;
  firstBetUnlockedAt: number | null;
  daysActive: number;
  reviewStatus: WalletReviewStatus;
};

export type BetActivityStatus = "settled" | "refunded" | "cancelled" | "pending";

export type BetActivityRow = {
  user: string;
  roundId: string;
  contractAddress?: string;
  contractVersion?: "v1" | "v2";
  token: string;
  epoch: number;
  position: Position;
  amountUSD: number; // raw bet amount
  amountUSDCe6: string; // 6dp integer string for export/Merkle stability
  eligibleAmountUSD: number; // amount counted toward season after daily cap (0 if not eligible)
  eligibleAmountUSDCe6: string;
  cappedAmountUSD: number; // amount above daily cap (0 if not eligible)
  cappedAmountUSDCe6: string;
  pointsEarned: number; // base points + first-bet bonus on the unlocking row, if any
  pointsEarnedE6: string; // 6dp integer string
  roundStatus: BetActivityStatus;
  eligible: boolean;
  exclusionCode: ExclusionCode | null;
  exclusionReason: string | null;
  unlocksFirstBet: boolean;
  placedAt: number;
  settledAt: number; // 0 if not yet known
};

export type SeasonComputation = {
  walletPoints: Map<string, WalletPoints>;
  activityByUser: Map<string, BetActivityRow[]>;
};

export const SEASON_1_CONFIG: SeasonConfig = {
  // Defaults match published rules at /season-1.
  // Start/end can be overridden via env at the API boundary; the engine itself stays pure.
  startUnix: 1775433600, // 2026-04-06 00:00 UTC
  endUnix: 1778198400, // 2026-05-08 00:00 UTC
  minBetUSDC: 1_000_000n,
  dailyCapUSDC: 100_000_000n,
  firstBetThresholdUSDC: 10_000_000n,
  firstBetBonusPoints: 10,
  pointsPerDollar: 1,
};

const ELIGIBLE_STATUSES = new Set<RoundStatus>(["settled", "refunded"]);

const utcDayKey = (unixSec: number) => {
  const d = new Date(unixSec * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const EXCLUSION_LABELS: Record<ExclusionCode, string> = {
  outside_season_window: "outside season window",
  round_not_settled: "round not settled yet",
  cancelled_round: "round cancelled",
  below_min_bet: "below $1 minimum bet",
  opposite_side_same_round: "opposite-side same round",
  wallet_blocklisted: "wallet blocklisted",
  manual_review_exclusion: "manual review exclusion",
};

function classifyEvent(
  event: BetEventInput,
  status: RoundStatus | undefined,
  config: SeasonConfig,
  positions: Set<Position> | undefined,
): {
  activityStatus: BetActivityStatus;
  eligible: boolean;
  code: ExclusionCode | null;
} {
  let activityStatus: BetActivityStatus;
  if (!status) activityStatus = "pending";
  else activityStatus = status;

  if (activityStatus === "pending") return { activityStatus, eligible: false, code: "round_not_settled" };
  if (activityStatus === "cancelled") return { activityStatus, eligible: false, code: "cancelled_round" };
  if (!ELIGIBLE_STATUSES.has(activityStatus as RoundStatus)) {
    return { activityStatus, eligible: false, code: "round_not_settled" };
  }
  if (event.amount < config.minBetUSDC) return { activityStatus, eligible: false, code: "below_min_bet" };
  if (positions && positions.size > 1) return { activityStatus, eligible: false, code: "opposite_side_same_round" };
  return { activityStatus, eligible: true, code: null };
}

const toUSDCe6 = (n: bigint) => n.toString();
const toPointsE6 = (points: number) => Math.round(points * 1_000_000).toString();

export type WalletExclusionEntry = {
  reason: ExclusionCode;
  notes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
};

export type ManualOverrides = {
  flaggedWallets?: Set<string>; // marks reviewStatus="review", does NOT zero points
  excludedWallets?: Map<string, WalletExclusionEntry>; // zeros points and marks excluded
};

export type ComputeSeasonOptions = ManualOverrides & {
  windowMode?: "placed" | "settled"; // default "placed" (live UI). Use "settled" for final export.
};

export function computeSeason(
  events: BetEventInput[],
  roundData: Map<string, RoundSettlement>,
  config: SeasonConfig,
  options: ComputeSeasonOptions = {},
): SeasonComputation {
  const walletPoints = new Map<string, WalletPoints>();
  const activityByUser = new Map<string, BetActivityRow[]>();
  const flagged = new Set(Array.from(options.flaggedWallets ?? [], w => w.toLowerCase()));
  const excludedRaw = options.excludedWallets ?? new Map<string, WalletExclusionEntry>();
  const excludedWallets = new Map<string, WalletExclusionEntry>();
  excludedRaw.forEach((entry, wallet) => excludedWallets.set(wallet.toLowerCase(), entry));
  const windowMode = options.windowMode ?? "placed";

  const eventInWindow = (e: BetEventInput) => {
    if (windowMode === "settled") {
      const round = roundData.get(e.roundId);
      const t = round?.settledAt ?? 0;
      // If settledAt is unknown, fall back to placedAt for window membership.
      const reference = t > 0 ? t : e.placedAt;
      return reference >= config.startUnix && reference < config.endUnix;
    }
    return e.placedAt >= config.startUnix && e.placedAt < config.endUnix;
  };
  const inWindow = events.filter(eventInWindow);

  // Detect opposite-side bets per (user, roundId)
  const userRoundPositions = new Map<string, Set<Position>>();
  for (const e of inWindow) {
    const key = `${e.user.toLowerCase()}:${e.roundId}`;
    const set = userRoundPositions.get(key) ?? new Set<Position>();
    set.add(e.position);
    userRoundPositions.set(key, set);
  }

  // Group events by user, keeping chronological order within each user
  const eventsByUser = new Map<string, BetEventInput[]>();
  for (const e of inWindow) {
    const u = e.user.toLowerCase();
    const list = eventsByUser.get(u) ?? [];
    list.push(e);
    eventsByUser.set(u, list);
  }

  for (const [user, userEvents] of eventsByUser) {
    userEvents.sort((a, b) => a.placedAt - b.placedAt);

    const walletExcluded = excludedWallets.get(user);
    const dailyUsed = new Map<string, bigint>();
    let totalEligibleUSDC = 0n;
    let totalRawUSDC = 0n;
    let cappedUSDC = 0n;
    let runningEligibleUSDC = 0n;
    let firstBetUnlockedAt: number | null = null;
    let firstBetBonusCreditedToRow = false;
    let excludedBets = 0;
    const exclusionReasonSet = new Set<string>();
    const exclusionCodeSet = new Set<ExclusionCode>();

    const rows: BetActivityRow[] = [];

    for (const e of userEvents) {
      totalRawUSDC += e.amount;
      const round = roundData.get(e.roundId);
      const positions = userRoundPositions.get(`${user}:${e.roundId}`);
      const classified = classifyEvent(e, round?.status, config, positions);
      const { activityStatus } = classified;
      let { eligible, code } = classified;
      let unlocksFirstBet = false;

      // Manual wallet exclusion overrides natural eligibility.
      if (walletExcluded) {
        eligible = false;
        code = walletExcluded.reason;
      }

      let eligibleAmount = 0n;
      let cappedAmount = 0n;
      let pointsEarned = 0;

      if (eligible) {
        const day = utcDayKey(e.placedAt);
        const used = dailyUsed.get(day) ?? 0n;
        const remaining = config.dailyCapUSDC > used ? config.dailyCapUSDC - used : 0n;
        eligibleAmount = e.amount < remaining ? e.amount : remaining;
        cappedAmount = e.amount - eligibleAmount;
        cappedUSDC += cappedAmount;
        dailyUsed.set(day, used + eligibleAmount);
        totalEligibleUSDC += eligibleAmount;
        runningEligibleUSDC += eligibleAmount;

        const eligibleAmountUSD = Number(eligibleAmount) / 1_000_000;
        pointsEarned = Math.floor(eligibleAmountUSD * config.pointsPerDollar);

        if (firstBetUnlockedAt === null && runningEligibleUSDC >= config.firstBetThresholdUSDC) {
          firstBetUnlockedAt = e.placedAt;
          unlocksFirstBet = true;
          pointsEarned += config.firstBetBonusPoints;
          firstBetBonusCreditedToRow = true;
        }
      } else {
        excludedBets += 1;
        if (code) {
          exclusionCodeSet.add(code);
          exclusionReasonSet.add(EXCLUSION_LABELS[code]);
        }
      }

      rows.push({
        user,
        roundId: e.roundId,
        contractAddress: e.contractAddress,
        contractVersion: e.contractVersion,
        token: e.token.toLowerCase(),
        epoch: e.epoch,
        position: e.position,
        amountUSD: Number(e.amount) / 1_000_000,
        amountUSDCe6: toUSDCe6(e.amount),
        eligibleAmountUSD: Number(eligibleAmount) / 1_000_000,
        eligibleAmountUSDCe6: toUSDCe6(eligibleAmount),
        cappedAmountUSD: Number(cappedAmount) / 1_000_000,
        cappedAmountUSDCe6: toUSDCe6(cappedAmount),
        pointsEarned,
        pointsEarnedE6: toPointsE6(pointsEarned),
        roundStatus: activityStatus,
        eligible,
        exclusionCode: code,
        exclusionReason: code ? EXCLUSION_LABELS[code] : null,
        unlocksFirstBet,
        placedAt: e.placedAt,
        settledAt: round?.settledAt ?? 0,
      });
    }

    activityByUser.set(user, rows);

    const eligibleVolumeUSD = Number(totalEligibleUSDC) / 1_000_000;
    const baseVolumePoints = Math.floor(eligibleVolumeUSD * config.pointsPerDollar);
    const firstBetUnlocked = firstBetUnlockedAt !== null;
    const firstBetBonus = firstBetBonusCreditedToRow ? config.firstBetBonusPoints : 0;

    walletPoints.set(user, {
      user,
      seasonPoints: walletExcluded ? 0 : baseVolumePoints + firstBetBonus,
      baseVolumePoints: walletExcluded ? 0 : baseVolumePoints,
      firstBetBonusPoints: walletExcluded ? 0 : firstBetBonus,
      eligibleVolumeUSD: walletExcluded ? 0 : eligibleVolumeUSD,
      rawVolumeUSD: Number(totalRawUSDC) / 1_000_000,
      cappedVolumeUSD: walletExcluded ? 0 : Number(cappedUSDC) / 1_000_000,
      excludedBets,
      exclusionReasons: Array.from(exclusionReasonSet),
      firstBetUnlocked: walletExcluded ? false : firstBetUnlocked,
      firstBetUnlockedAt: walletExcluded ? null : firstBetUnlockedAt,
      daysActive: dailyUsed.size,
      reviewStatus: walletExcluded ? "excluded" : flagged.has(user) ? "review" : "ok",
    });
  }

  return { walletPoints, activityByUser };
}

// Back-compat wrapper — same signature as before.
export function computeSeasonPoints(
  events: BetEventInput[],
  roundData: Map<string, RoundSettlement>,
  config: SeasonConfig,
  flaggedWallets: Set<string> = new Set(),
): Map<string, WalletPoints> {
  return computeSeason(events, roundData, config, { flaggedWallets }).walletPoints;
}

export function emptyWalletPoints(user: string): WalletPoints {
  return {
    user: user.toLowerCase(),
    seasonPoints: 0,
    baseVolumePoints: 0,
    firstBetBonusPoints: 0,
    eligibleVolumeUSD: 0,
    rawVolumeUSD: 0,
    cappedVolumeUSD: 0,
    excludedBets: 0,
    exclusionReasons: [],
    firstBetUnlocked: false,
    firstBetUnlockedAt: null,
    daysActive: 0,
    reviewStatus: "ok",
  };
}

export type PublicSeasonConfig = {
  startUnix: number;
  endUnix: number;
  minBetUSD: number;
  dailyCapUSD: number;
  firstBetThresholdUSD: number;
  firstBetBonusPoints: number;
  pointsPerDollar: number;
};

export function toPublicSeasonConfig(cfg: SeasonConfig): PublicSeasonConfig {
  return {
    startUnix: cfg.startUnix,
    endUnix: cfg.endUnix,
    minBetUSD: Number(cfg.minBetUSDC) / 1_000_000,
    dailyCapUSD: Number(cfg.dailyCapUSDC) / 1_000_000,
    firstBetThresholdUSD: Number(cfg.firstBetThresholdUSDC) / 1_000_000,
    firstBetBonusPoints: cfg.firstBetBonusPoints,
    pointsPerDollar: cfg.pointsPerDollar,
  };
}
