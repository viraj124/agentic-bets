import { onchainTable } from "ponder";

export const userStats = onchainTable("user_stats", t => ({
  id: t.hex().primaryKey(), // lowercased address
  totalBets: t.integer().notNull().default(0),
  totalWagered: t.bigint().notNull().default(0n), // raw USDC, 6 decimals
  totalWon: t.bigint().notNull().default(0n),
  wins: t.integer().notNull().default(0),
}));

export const betParticipation = onchainTable("bet_participation", t => ({
  id: t.text().primaryKey(), // `${user}:${token}:${epoch}`
  user: t.hex().notNull(),
  token: t.hex().notNull(),
  epoch: t.bigint().notNull(),
  position: t.integer().notNull(), // 0 = bull, 1 = bear
  amount: t.bigint().notNull().default(0n), // raw USDC (6 decimals)
  claimed: t.boolean().notNull().default(false),
  claimedAmount: t.bigint().notNull().default(0n),
  placedAt: t.bigint().notNull().default(0n), // unix timestamp (seconds)
}));

export const betEvent = onchainTable("bet_events", t => ({
  id: t.text().primaryKey(), // `${contract}:${user}:${token}:${epoch}`
  roundId: t.text().notNull(), // `${contract}:${token}:${epoch}`
  contractAddress: t.hex().notNull(),
  contractVersion: t.text().notNull(), // "v1" | "v2"
  user: t.hex().notNull(),
  token: t.hex().notNull(),
  epoch: t.bigint().notNull(),
  position: t.integer().notNull(), // 0 = bull, 1 = bear
  amount: t.bigint().notNull(), // raw USDC, 6 decimals
  placedAt: t.bigint().notNull(), // unix timestamp (seconds)
  placedBlock: t.bigint().notNull(),
  placedTxHash: t.hex().notNull(),
  placedLogIndex: t.integer().notNull(),
}));

export const roundSettlement = onchainTable("round_settlements", t => ({
  id: t.text().primaryKey(), // `${contract}:${token}:${epoch}`
  contractAddress: t.hex().notNull(),
  contractVersion: t.text().notNull(), // "v1" | "v2"
  token: t.hex().notNull(),
  epoch: t.bigint().notNull(),
  status: t.text().notNull(), // "settled" | "cancelled" | "refunded"
  closePrice: t.bigint().notNull().default(0n),
  settler: t.hex(),
  settledAt: t.bigint().notNull(), // unix timestamp (seconds)
  settledBlock: t.bigint().notNull(),
  settledTxHash: t.hex().notNull(),
  settledLogIndex: t.integer().notNull(),
}));

export const cancelledRound = onchainTable("cancelled_round", t => ({
  id: t.text().primaryKey(), // `${token}:${epoch}`
}));
