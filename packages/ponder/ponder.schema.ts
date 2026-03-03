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
