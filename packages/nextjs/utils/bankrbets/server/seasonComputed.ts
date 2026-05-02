import { type BetActivityRow, type SeasonConfig, type WalletPoints, computeSeason } from "../seasonPoints";
import { fetchAllBetEvents, fetchRoundStatuses } from "./seasonData";
import "server-only";

const TTL_MS = 30_000;

export type SeasonComputed = {
  config: SeasonConfig;
  walletPoints: Map<string, WalletPoints>;
  activityByUser: Map<string, BetActivityRow[]>;
  rankByUser: Map<string, number>; // 1-indexed; only set for wallets in the leaderboard
  sortedLeaderboard: WalletPoints[];
  updatedAt: number;
};

let cache: SeasonComputed | null = null;
let inFlight: Promise<SeasonComputed> | null = null;

const configsMatch = (a: SeasonConfig | undefined, b: SeasonConfig) =>
  !!a && a.startUnix === b.startUnix && a.endUnix === b.endUnix;

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

async function refresh(config: SeasonConfig): Promise<SeasonComputed> {
  const events = await fetchAllBetEvents(config.startUnix);
  const roundIds = Array.from(new Set(events.map(e => e.roundId)));
  const statuses = await fetchRoundStatuses(roundIds);
  const { walletPoints, activityByUser } = computeSeason(events, statuses, config);
  const { sortedLeaderboard, rankByUser } = rankWallets(walletPoints);
  cache = { config, walletPoints, activityByUser, rankByUser, sortedLeaderboard, updatedAt: Date.now() };
  return cache;
}

export async function getSeasonComputed(config: SeasonConfig): Promise<SeasonComputed> {
  if (cache && configsMatch(cache.config, config) && Date.now() - cache.updatedAt < TTL_MS) {
    return cache;
  }
  if (inFlight) return inFlight;
  inFlight = refresh(config).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
