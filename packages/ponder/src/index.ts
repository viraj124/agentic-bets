import { ponder } from "ponder:registry";
import { userStats } from "../ponder.schema";

ponder.on("BankrBetsPrediction:BetBull", async ({ event, context }) => {
  const id = event.args.sender.toLowerCase() as `0x${string}`;
  await context.db
    .insert(userStats)
    .values({ id, totalBets: 1, totalWagered: event.args.amount, totalWon: 0n, wins: 0 })
    .onConflictDoUpdate(row => ({
      totalBets: row.totalBets + 1,
      totalWagered: row.totalWagered + event.args.amount,
    }));
});

ponder.on("BankrBetsPrediction:BetBear", async ({ event, context }) => {
  const id = event.args.sender.toLowerCase() as `0x${string}`;
  await context.db
    .insert(userStats)
    .values({ id, totalBets: 1, totalWagered: event.args.amount, totalWon: 0n, wins: 0 })
    .onConflictDoUpdate(row => ({
      totalBets: row.totalBets + 1,
      totalWagered: row.totalWagered + event.args.amount,
    }));
});

ponder.on("BankrBetsPrediction:Claim", async ({ event, context }) => {
  if (event.args.amount === 0n) return;
  const id = event.args.sender.toLowerCase() as `0x${string}`;
  await context.db
    .insert(userStats)
    .values({ id, totalBets: 0, totalWagered: 0n, totalWon: event.args.amount, wins: 1 })
    .onConflictDoUpdate(row => ({
      totalWon: row.totalWon + event.args.amount,
      wins: row.wins + 1,
    }));
});
