import { onchainTable } from "ponder";

export const userStats = onchainTable("user_stats", t => ({
  id: t.hex().primaryKey(), // lowercased address
  totalBets: t.integer().notNull().default(0),
  totalWagered: t.bigint().notNull().default(0n), // raw USDC, 6 decimals
  totalWon: t.bigint().notNull().default(0n),
  wins: t.integer().notNull().default(0),
}));
