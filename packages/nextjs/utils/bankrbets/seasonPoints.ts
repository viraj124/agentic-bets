// Pure points engine for Season 1.
// No network, no Date.now() — given the same inputs it always produces the same outputs.

export type Position = 0 | 1; // 0 = bull, 1 = bear

export type RoundStatus = "settled" | "cancelled" | "refunded";

export type BetEventInput = {
  user: string;
  roundId: string; // matches RoundSettlement id, e.g. `${contract}:${token}:${epoch}`
  token: string; // 0x-prefixed lowercase
  epoch: number;
  amount: bigint; // raw USDC, 6 decimals
  placedAt: number; // unix seconds
  position: Position;
};

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
  token: string;
  epoch: number;
  position: Position;
  amountUSD: number; // raw bet amount
  eligibleAmountUSD: number; // amount counted toward season after daily cap (0 if not eligible)
  cappedAmountUSD: number; // amount above daily cap (0 if not eligible)
  pointsEarned: number; // base points + first-bet bonus on the unlocking row, if any
  roundStatus: BetActivityStatus;
  eligible: boolean;
  exclusionReason: string | null;
  unlocksFirstBet: boolean;
  placedAt: number;
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

const REASON_PENDING = "round not settled yet";
const REASON_CANCELLED = "round cancelled";
const REASON_BELOW_MIN = "below $1 minimum bet";
const REASON_OPPOSITE_SIDE = "opposite-side same round";

function classifyEvent(
  event: BetEventInput,
  status: RoundStatus | undefined,
  config: SeasonConfig,
  positions: Set<Position> | undefined,
): { activityStatus: BetActivityStatus; eligible: boolean; reason: string | null } {
  let activityStatus: BetActivityStatus;
  if (!status) activityStatus = "pending";
  else activityStatus = status;

  if (activityStatus === "pending") return { activityStatus, eligible: false, reason: REASON_PENDING };
  if (activityStatus === "cancelled") return { activityStatus, eligible: false, reason: REASON_CANCELLED };
  if (!ELIGIBLE_STATUSES.has(activityStatus as RoundStatus)) {
    return { activityStatus, eligible: false, reason: REASON_PENDING };
  }
  if (event.amount < config.minBetUSDC) return { activityStatus, eligible: false, reason: REASON_BELOW_MIN };
  if (positions && positions.size > 1) return { activityStatus, eligible: false, reason: REASON_OPPOSITE_SIDE };
  return { activityStatus, eligible: true, reason: null };
}

export function computeSeason(
  events: BetEventInput[],
  roundStatuses: Map<string, RoundStatus>,
  config: SeasonConfig,
  flaggedWallets: Set<string> = new Set(),
): SeasonComputation {
  const walletPoints = new Map<string, WalletPoints>();
  const activityByUser = new Map<string, BetActivityRow[]>();
  const flagged = new Set(Array.from(flaggedWallets, w => w.toLowerCase()));

  const inWindow = events.filter(e => e.placedAt >= config.startUnix && e.placedAt < config.endUnix);

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

    const dailyUsed = new Map<string, bigint>();
    let totalEligibleUSDC = 0n;
    let totalRawUSDC = 0n;
    let cappedUSDC = 0n;
    let runningEligibleUSDC = 0n;
    let firstBetUnlockedAt: number | null = null;
    let firstBetBonusCreditedToRow = false;
    let excludedBets = 0;
    const exclusionReasonSet = new Set<string>();

    const rows: BetActivityRow[] = [];

    for (const e of userEvents) {
      totalRawUSDC += e.amount;
      const status = roundStatuses.get(e.roundId);
      const positions = userRoundPositions.get(`${user}:${e.roundId}`);
      const { activityStatus, eligible, reason } = classifyEvent(e, status, config, positions);

      let eligibleAmount = 0n;
      let cappedAmount = 0n;
      let pointsEarned = 0;
      let unlocksFirstBet = false;

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
        if (reason) exclusionReasonSet.add(reason);
      }

      rows.push({
        user,
        roundId: e.roundId,
        token: e.token.toLowerCase(),
        epoch: e.epoch,
        position: e.position,
        amountUSD: Number(e.amount) / 1_000_000,
        eligibleAmountUSD: Number(eligibleAmount) / 1_000_000,
        cappedAmountUSD: Number(cappedAmount) / 1_000_000,
        pointsEarned,
        roundStatus: activityStatus,
        eligible,
        exclusionReason: reason,
        unlocksFirstBet,
        placedAt: e.placedAt,
      });
    }

    activityByUser.set(user, rows);

    const eligibleVolumeUSD = Number(totalEligibleUSDC) / 1_000_000;
    const baseVolumePoints = Math.floor(eligibleVolumeUSD * config.pointsPerDollar);
    const firstBetUnlocked = firstBetUnlockedAt !== null;
    const firstBetBonus = firstBetBonusCreditedToRow ? config.firstBetBonusPoints : 0;

    walletPoints.set(user, {
      user,
      seasonPoints: baseVolumePoints + firstBetBonus,
      baseVolumePoints,
      firstBetBonusPoints: firstBetBonus,
      eligibleVolumeUSD,
      rawVolumeUSD: Number(totalRawUSDC) / 1_000_000,
      cappedVolumeUSD: Number(cappedUSDC) / 1_000_000,
      excludedBets,
      exclusionReasons: Array.from(exclusionReasonSet),
      firstBetUnlocked,
      firstBetUnlockedAt,
      daysActive: dailyUsed.size,
      reviewStatus: flagged.has(user) ? "review" : "ok",
    });
  }

  return { walletPoints, activityByUser };
}

// Back-compat wrapper — same signature as before.
export function computeSeasonPoints(
  events: BetEventInput[],
  roundStatuses: Map<string, RoundStatus>,
  config: SeasonConfig,
  flaggedWallets: Set<string> = new Set(),
): Map<string, WalletPoints> {
  return computeSeason(events, roundStatuses, config, flaggedWallets).walletPoints;
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
