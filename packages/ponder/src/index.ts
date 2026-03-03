import { ponder } from "ponder:registry";
import { betParticipation, userStats } from "../ponder.schema";

const toBetId = (user: string, token: string, epoch: bigint) =>
  `${user.toLowerCase()}:${token.toLowerCase()}:${epoch.toString()}`;

ponder.on("BankrBetsPrediction:BetBull", async ({ event, context }) => {
  const id = event.args.sender.toLowerCase() as `0x${string}`;
  const token = event.args.token.toLowerCase() as `0x${string}`;
  const betId = toBetId(id, token, event.args.epoch);

  await context.db
    .insert(userStats)
    .values({ id, totalBets: 1, totalWagered: event.args.amount, totalWon: 0n, wins: 0 })
    .onConflictDoUpdate(row => ({
      totalBets: row.totalBets + 1,
      totalWagered: row.totalWagered + event.args.amount,
    }));

  await context.db
    .insert(betParticipation)
    .values({
      id: betId,
      user: id,
      token,
      epoch: event.args.epoch,
      position: 0,
      amount: event.args.amount,
      claimed: false,
      claimedAmount: 0n,
      placedAt: event.block.timestamp,
    })
    .onConflictDoUpdate(() => ({
      position: 0,
      amount: event.args.amount,
      placedAt: event.block.timestamp,
    }));
});

ponder.on("BankrBetsPrediction:BetBear", async ({ event, context }) => {
  const id = event.args.sender.toLowerCase() as `0x${string}`;
  const token = event.args.token.toLowerCase() as `0x${string}`;
  const betId = toBetId(id, token, event.args.epoch);

  await context.db
    .insert(userStats)
    .values({ id, totalBets: 1, totalWagered: event.args.amount, totalWon: 0n, wins: 0 })
    .onConflictDoUpdate(row => ({
      totalBets: row.totalBets + 1,
      totalWagered: row.totalWagered + event.args.amount,
    }));

  await context.db
    .insert(betParticipation)
    .values({
      id: betId,
      user: id,
      token,
      epoch: event.args.epoch,
      position: 1,
      amount: event.args.amount,
      claimed: false,
      claimedAmount: 0n,
      placedAt: event.block.timestamp,
    })
    .onConflictDoUpdate(() => ({
      position: 1,
      amount: event.args.amount,
      placedAt: event.block.timestamp,
    }));
});

ponder.on("BankrBetsPrediction:Claim", async ({ event, context }) => {
  const id = event.args.sender.toLowerCase() as `0x${string}`;
  const token = event.args.token.toLowerCase() as `0x${string}`;
  const betId = toBetId(id, token, event.args.epoch);

  await context.db
    .insert(betParticipation)
    .values({
      id: betId,
      user: id,
      token,
      epoch: event.args.epoch,
      position: 0,
      amount: 0n,
      claimed: true,
      claimedAmount: event.args.amount,
      placedAt: event.block.timestamp,
    })
    .onConflictDoUpdate(row => ({
      claimed: true,
      claimedAmount: row.claimedAmount + event.args.amount,
    }));

  if (event.args.amount === 0n) return;

  await context.db
    .insert(userStats)
    .values({ id, totalBets: 0, totalWagered: 0n, totalWon: event.args.amount, wins: 1 })
    .onConflictDoUpdate(row => ({
      totalWon: row.totalWon + event.args.amount,
      wins: row.wins + 1,
    }));
});
