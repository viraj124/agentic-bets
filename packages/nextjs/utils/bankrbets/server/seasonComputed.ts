import { type BetActivityRow, type SeasonConfig, type WalletPoints, computeSeason } from "../seasonPoints";
import { loadManualExclusions } from "./manualExclusions";
import { fetchAllBetEvents, fetchRoundSettlements } from "./seasonData";
import "server-only";

const TTL_MS = 30_000;

export type WindowMode = "placed" | "settled";

export type SeasonComputed = {
  config: SeasonConfig;
  windowMode: WindowMode;
  walletPoints: Map<string, WalletPoints>;
  activityByUser: Map<string, BetActivityRow[]>;
  rankByUser: Map<string, number>; // 1-indexed; only set for wallets in the leaderboard
  sortedLeaderboard: WalletPoints[];
  updatedAt: number;
};

let cache: SeasonComputed | null = null;
let inFlight: Promise<SeasonComputed> | null = null;

const isFinalized = () => process.env.NEXT_PUBLIC_SEASON_1_FINALIZED === "true";
const cacheMatch = (a: SeasonComputed | null, config: SeasonConfig, mode: WindowMode) =>
  !!a && a.config.startUnix === config.startUnix && a.config.endUnix === config.endUnix && a.windowMode === mode;

function rankWallets(walletPoints: Map<string, WalletPoints>): {
  sortedLeaderboard: WalletPoints[];
  rankByUser: Map<string, number>;
} {
  const sortedLeaderboard = Array.from(walletPoints.values())
    .filter(entry => entry.seasonPoints > 0 || entry.eligibleVolumeUSD > 0)
    .sort((a, b) => {
      if (b.seasonPoints !== a.seasonPoints) return b.seasonPoints - a.seasonPoints;
      if (b.eligibleVolumeUSD !== a.eligibleVolumeUSD) return b.eligibleVolumeUSD - a.eligibleVolumeUSD;
      return a.user.localeCompare(b.user);
    });
  const rankByUser = new Map<string, number>();
  sortedLeaderboard.forEach((entry, idx) => rankByUser.set(entry.user, idx + 1));
  return { sortedLeaderboard, rankByUser };
}

async function refresh(config: SeasonConfig, windowMode: WindowMode): Promise<SeasonComputed> {
  const useUnbounded = windowMode === "settled";
  const [events, manual] = await Promise.all([
    fetchAllBetEvents(config.startUnix, { unbounded: useUnbounded }),
    loadManualExclusions(),
  ]);
  const roundIds = Array.from(new Set(events.map(e => e.roundId)));
  const roundData = await fetchRoundSettlements(roundIds);
  const { walletPoints, activityByUser } = computeSeason(events, roundData, config, {
    flaggedWallets: manual.flagged,
    excludedWallets: manual.excluded,
    windowMode,
  });
  const { sortedLeaderboard, rankByUser } = rankWallets(walletPoints);
  cache = {
    config,
    windowMode,
    walletPoints,
    activityByUser,
    rankByUser,
    sortedLeaderboard,
    updatedAt: Date.now(),
  };
  return cache;
}

export async function getSeasonComputed(
  config: SeasonConfig,
  overrideWindowMode?: WindowMode,
): Promise<SeasonComputed> {
  const windowMode: WindowMode = overrideWindowMode ?? (isFinalized() ? "settled" : "placed");
  if (cache && cacheMatch(cache, config, windowMode) && Date.now() - cache.updatedAt < TTL_MS) {
    return cache;
  }
  if (inFlight) return inFlight;
  inFlight = refresh(config, windowMode).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
