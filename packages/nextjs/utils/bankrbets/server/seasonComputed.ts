import { type SeasonConfig, type WalletPoints, computeSeasonPoints } from "../seasonPoints";
import { fetchAllBetEvents, fetchRoundStatuses } from "./seasonData";
import "server-only";

const TTL_MS = 30_000;

export type SeasonComputed = {
  config: SeasonConfig;
  computed: Map<string, WalletPoints>;
  updatedAt: number;
};

let cache: SeasonComputed | null = null;
let inFlight: Promise<SeasonComputed> | null = null;

const configsMatch = (a: SeasonConfig | undefined, b: SeasonConfig) =>
  !!a && a.startUnix === b.startUnix && a.endUnix === b.endUnix;

async function refresh(config: SeasonConfig): Promise<SeasonComputed> {
  const events = await fetchAllBetEvents(config.startUnix);
  const roundIds = Array.from(new Set(events.map(e => e.roundId)));
  const statuses = await fetchRoundStatuses(roundIds);
  const computed = computeSeasonPoints(events, statuses, config);
  cache = { config, computed, updatedAt: Date.now() };
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
