// Pure points engine for Season 1.
// No network, no Date.now() — given the same inputs it always produces the same outputs.

export type Position = 0 | 1; // 0 = bull, 1 = bear

export type RoundStatus = "settled" | "cancelled" | "refunded";

export type BetEventInput = {
  user: string;
  roundId: string; // matches RoundSettlement id, e.g. `${contract}:${token}:${epoch}`
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

export const SEASON_1_CONFIG: SeasonConfig = {
  // Defaults match published rules at /season-1.
  // Start/end can be overridden via env at the API boundary; the engine itself stays pure.
  startUnix: 1777507200, // 2026-04-30 00:00 UTC
  endUnix: 1778716800, // 2026-05-14 00:00 UTC (14 days)
  minBetUSDC: 1_000_000n,
  dailyCapUSDC: 50_000_000n,
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

const REASON_NOT_SETTLED = "round not settled or refunded";
const REASON_BELOW_MIN = "below min bet";
const REASON_OPPOSITE_SIDE = "opposite-side same round";

type Classified = { event: BetEventInput; eligible: boolean; reason?: string };

export function computeSeasonPoints(
  events: BetEventInput[],
  roundStatuses: Map<string, RoundStatus>,
  config: SeasonConfig,
  flaggedWallets: Set<string> = new Set(),
): Map<string, WalletPoints> {
  const result = new Map<string, WalletPoints>();
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

  const classified: Classified[] = inWindow.map(e => {
    const status = roundStatuses.get(e.roundId);
    if (!status || !ELIGIBLE_STATUSES.has(status)) {
      return { event: e, eligible: false, reason: REASON_NOT_SETTLED };
    }
    if (e.amount < config.minBetUSDC) {
      return { event: e, eligible: false, reason: REASON_BELOW_MIN };
    }
    const positions = userRoundPositions.get(`${e.user.toLowerCase()}:${e.roundId}`);
    if (positions && positions.size > 1) {
      return { event: e, eligible: false, reason: REASON_OPPOSITE_SIDE };
    }
    return { event: e, eligible: true };
  });

  const eligibleByUser = new Map<string, BetEventInput[]>();
  const exclusions = new Map<string, { count: number; reasons: Set<string> }>();

  for (const c of classified) {
    const user = c.event.user.toLowerCase();
    if (c.eligible) {
      const list = eligibleByUser.get(user) ?? [];
      list.push(c.event);
      eligibleByUser.set(user, list);
    } else {
      const entry = exclusions.get(user) ?? { count: 0, reasons: new Set<string>() };
      entry.count += 1;
      if (c.reason) entry.reasons.add(c.reason);
      exclusions.set(user, entry);
    }
  }

  for (const [user, userEvents] of eligibleByUser) {
    userEvents.sort((a, b) => a.placedAt - b.placedAt);

    const dailyUsed = new Map<string, bigint>();
    let totalEligibleUSDC = 0n;
    let totalRawUSDC = 0n;
    let cappedUSDC = 0n;
    let runningEligibleUSDC = 0n;
    let firstBetUnlockedAt: number | null = null;

    for (const e of userEvents) {
      totalRawUSDC += e.amount;
      const day = utcDayKey(e.placedAt);
      const used = dailyUsed.get(day) ?? 0n;
      const remaining = config.dailyCapUSDC > used ? config.dailyCapUSDC - used : 0n;
      const allowed = e.amount < remaining ? e.amount : remaining;
      const overflow = e.amount - allowed;
      cappedUSDC += overflow;
      dailyUsed.set(day, used + allowed);
      totalEligibleUSDC += allowed;
      runningEligibleUSDC += allowed;

      if (firstBetUnlockedAt === null && runningEligibleUSDC >= config.firstBetThresholdUSDC) {
        firstBetUnlockedAt = e.placedAt;
      }
    }

    const eligibleVolumeUSD = Number(totalEligibleUSDC) / 1_000_000;
    const baseVolumePoints = Math.floor(eligibleVolumeUSD * config.pointsPerDollar);
    const firstBetUnlocked = firstBetUnlockedAt !== null;
    const firstBetBonus = firstBetUnlocked ? config.firstBetBonusPoints : 0;
    const exclusion = exclusions.get(user);

    result.set(user, {
      user,
      seasonPoints: baseVolumePoints + firstBetBonus,
      baseVolumePoints,
      firstBetBonusPoints: firstBetBonus,
      eligibleVolumeUSD,
      rawVolumeUSD: Number(totalRawUSDC) / 1_000_000,
      cappedVolumeUSD: Number(cappedUSDC) / 1_000_000,
      excludedBets: exclusion?.count ?? 0,
      exclusionReasons: Array.from(exclusion?.reasons ?? []),
      firstBetUnlocked,
      firstBetUnlockedAt,
      daysActive: dailyUsed.size,
      reviewStatus: flagged.has(user) ? "review" : "ok",
    });
  }

  // Wallets that placed only excluded bets still get a row so the UI can show review state.
  for (const [user, exclusion] of exclusions) {
    if (result.has(user)) continue;
    result.set(user, {
      user,
      seasonPoints: 0,
      baseVolumePoints: 0,
      firstBetBonusPoints: 0,
      eligibleVolumeUSD: 0,
      rawVolumeUSD: 0,
      cappedVolumeUSD: 0,
      excludedBets: exclusion.count,
      exclusionReasons: Array.from(exclusion.reasons),
      firstBetUnlocked: false,
      firstBetUnlockedAt: null,
      daysActive: 0,
      reviewStatus: flagged.has(user) ? "review" : "ok",
    });
  }

  return result;
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
