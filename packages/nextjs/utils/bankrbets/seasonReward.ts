// Season 1 reward lookup. Reads the pinned distribution artifact
// (season-1-distribution.json) — the same file used for the manual
// on-chain sends — so the UI always matches what was actually paid out.
import distribution from "~~/season-1-distribution.json";

export type SeasonRewardRow = {
  wallet: string;
  rank: number;
  pointsE6: string;
  sharePct: number;
  amountWei: string;
  amountHuman: string;
};

export type SeasonRewardMeta = {
  seasonId: number;
  token: { address: string; decimals: number; symbol: string };
  chainId: number;
  poolBps: number;
  curve: string;
  poolHuman: string;
  distributedHuman: string;
  walletsDistributed: number;
  snapshotGitCommit: string;
  distributionGeneratedAt: string;
};

const dist = distribution as unknown as {
  seasonId: number;
  snapshotGitCommit: string;
  distributionGeneratedAt: string;
  token: { address: string; decimals: number; symbol: string };
  chainId: number;
  policy: { curve: string; poolBps: number };
  balances: { poolHuman: string };
  totals: { distributedHuman: string; walletsDistributed: number };
  rows: SeasonRewardRow[];
};

export const SEASON_REWARD_META: SeasonRewardMeta = {
  seasonId: dist.seasonId,
  token: dist.token,
  chainId: dist.chainId,
  poolBps: dist.policy.poolBps,
  curve: dist.policy.curve,
  poolHuman: dist.balances.poolHuman,
  distributedHuman: dist.totals.distributedHuman,
  walletsDistributed: dist.totals.walletsDistributed,
  snapshotGitCommit: dist.snapshotGitCommit,
  distributionGeneratedAt: dist.distributionGeneratedAt,
};

const ROWS: SeasonRewardRow[] = [...dist.rows].sort((a, b) => a.rank - b.rank);

const BY_WALLET = new Map<string, SeasonRewardRow>(ROWS.map(r => [r.wallet.toLowerCase(), r]));

export function getSeasonReward(address: string): SeasonRewardRow | null {
  return BY_WALLET.get(address.toLowerCase()) ?? null;
}

export function getAllSeasonRewards(): SeasonRewardRow[] {
  return ROWS;
}

// Compact display: 1,234,567.89 (2dp, grouped) from a decimal string.
export function formatAgbets(amountHuman: string, fractionDigits = 2): string {
  const n = Number(amountHuman);
  if (!Number.isFinite(n)) return amountHuman;
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: fractionDigits });
}
