import { ponder } from "ponder:registry";
import { betEvent, betParticipation, cancelledRound, roundSettlement, userStats } from "../ponder.schema";

const PREDICTION_V1_ADDRESS = "0xABADeb002247f2bd908Eeedb32918aEc304A0233".toLowerCase();
const PREDICTION_V2_ADDRESS = "0x2CD785Ba87e0841A8458141bc43d23a56a00557f".toLowerCase();

const toBetId = (user: string, token: string, epoch: bigint) =>
  `${user.toLowerCase()}:${token.toLowerCase()}:${epoch.toString()}`;

const toRoundId = (token: string, epoch: bigint) =>
  `${token.toLowerCase()}:${epoch.toString()}`;

const getContractAddress = (event: { log: { address: string } }) => event.log.address.toLowerCase() as `0x${string}`;

const getContractVersion = (contractAddress: string) =>
  contractAddress.toLowerCase() === PREDICTION_V2_ADDRESS ? "v2" : "v1";

const toIndexedRoundId = (contractAddress: string, token: string, epoch: bigint) =>
  `${contractAddress.toLowerCase()}:${token.toLowerCase()}:${epoch.toString()}`;

const toIndexedBetId = (contractAddress: string, user: string, token: string, epoch: bigint) =>
  `${contractAddress.toLowerCase()}:${user.toLowerCase()}:${token.toLowerCase()}:${epoch.toString()}`;

const indexBetEvent = async ({
  event,
  context,
  position,
}: {
  event: {
    args: { sender: string; token: string; epoch: bigint; amount: bigint };
    block: { number: bigint; timestamp: bigint };
    log: { address: string; logIndex: number };
    transaction: { hash: string };
  };
  context: Parameters<Parameters<typeof ponder.on>[1]>[0]["context"];
  position: 0 | 1;
}) => {
  const contractAddress = getContractAddress(event);
  const user = event.args.sender.toLowerCase() as `0x${string}`;
  const token = event.args.token.toLowerCase() as `0x${string}`;
  const roundId = toIndexedRoundId(contractAddress, token, event.args.epoch);
  const id = toIndexedBetId(contractAddress, user, token, event.args.epoch);

  await context.db
    .insert(betEvent)
    .values({
      id,
      roundId,
      contractAddress,
      contractVersion: getContractVersion(contractAddress),
      user,
      token,
      epoch: event.args.epoch,
      position,
      amount: event.args.amount,
      placedAt: event.block.timestamp,
      placedBlock: event.block.number,
      placedTxHash: event.transaction.hash as `0x${string}`,
      placedLogIndex: event.log.logIndex,
    })
    .onConflictDoUpdate(() => ({
      roundId,
      contractAddress,
      contractVersion: getContractVersion(contractAddress),
      user,
      token,
      epoch: event.args.epoch,
      position,
      amount: event.args.amount,
      placedAt: event.block.timestamp,
      placedBlock: event.block.number,
      placedTxHash: event.transaction.hash as `0x${string}`,
      placedLogIndex: event.log.logIndex,
    }));
};

const indexRoundSettlement = async ({
  event,
  context,
  status,
  closePrice = 0n,
  settler,
}: {
  event: {
    args: { token: string; epoch: bigint };
    block: { number: bigint; timestamp: bigint };
    log: { address: string; logIndex: number };
    transaction: { hash: string };
  };
  context: Parameters<Parameters<typeof ponder.on>[1]>[0]["context"];
  status: "settled" | "cancelled" | "refunded";
  closePrice?: bigint;
  settler?: string;
}) => {
  const contractAddress = getContractAddress(event);
  const token = event.args.token.toLowerCase() as `0x${string}`;
  const id = toIndexedRoundId(contractAddress, token, event.args.epoch);

  await context.db
    .insert(roundSettlement)
    .values({
      id,
      contractAddress,
      contractVersion: getContractVersion(contractAddress),
      token,
      epoch: event.args.epoch,
      status,
      closePrice,
      settler: settler?.toLowerCase() as `0x${string}` | undefined,
      settledAt: event.block.timestamp,
      settledBlock: event.block.number,
      settledTxHash: event.transaction.hash as `0x${string}`,
      settledLogIndex: event.log.logIndex,
    })
    .onConflictDoUpdate(() => ({
      contractAddress,
      contractVersion: getContractVersion(contractAddress),
      token,
      epoch: event.args.epoch,
      status,
      closePrice,
      settler: settler?.toLowerCase() as `0x${string}` | undefined,
      settledAt: event.block.timestamp,
      settledBlock: event.block.number,
      settledTxHash: event.transaction.hash as `0x${string}`,
      settledLogIndex: event.log.logIndex,
    }));
};

ponder.on("BankrBetsPrediction:BetBull", async ({ event, context }) => {
  const id = event.args.sender.toLowerCase() as `0x${string}`;
  const token = event.args.token.toLowerCase() as `0x${string}`;
  const betId = toBetId(id, token, event.args.epoch);

  await indexBetEvent({ event, context, position: 0 });

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

  await indexBetEvent({ event, context, position: 1 });

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

// Track cancelled/refunded rounds so the Claim handler can distinguish wins from refunds
ponder.on("BankrBetsPrediction:RoundCancelled", async ({ event, context }) => {
  await indexRoundSettlement({ event, context, status: "cancelled" });

  const roundId = toRoundId(event.args.token, event.args.epoch);
  await context.db.insert(cancelledRound).values({ id: roundId }).onConflictDoNothing();
});

ponder.on("BankrBetsPrediction:RoundRefunded", async ({ event, context }) => {
  await indexRoundSettlement({ event, context, status: "refunded" });

  const roundId = toRoundId(event.args.token, event.args.epoch);
  await context.db.insert(cancelledRound).values({ id: roundId }).onConflictDoNothing();
});

ponder.on("BankrBetsPrediction:RoundEnded", async ({ event, context }) => {
  await indexRoundSettlement({
    event,
    context,
    status: "settled",
    closePrice: event.args.closePrice,
    settler: event.args.settler,
  });
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

  // Check if this round was cancelled — if so, this claim is a refund, not a win
  const roundId = toRoundId(token, event.args.epoch);
  const wasCancelled = await context.db.find(cancelledRound, { id: roundId });

  if (wasCancelled) {
    // Refund: subtract the original wager from totalWagered and decrement totalBets
    // so the cancelled round is fully excluded from P/L and stats
    const bet = await context.db.find(betParticipation, { id: betId });
    const originalWager = bet?.amount ?? event.args.amount;
    await context.db
      .insert(userStats)
      .values({ id, totalBets: -1, totalWagered: -originalWager, totalWon: 0n, wins: 0 })
      .onConflictDoUpdate(row => ({
        totalBets: row.totalBets - 1,
        totalWagered: row.totalWagered - originalWager,
      }));
  } else {
    // Actual win
    await context.db
      .insert(userStats)
      .values({ id, totalBets: 0, totalWagered: 0n, totalWon: event.args.amount, wins: 1 })
      .onConflictDoUpdate(row => ({
        totalWon: row.totalWon + event.args.amount,
        wins: row.wins + 1,
      }));
  }
});
