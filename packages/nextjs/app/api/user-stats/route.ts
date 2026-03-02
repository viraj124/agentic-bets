import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, isAddress, parseAbiItem } from "viem";
import { base } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";

export const maxDuration = 30;

const TARGET_CHAIN_ID = base.id;
const CONTRACT_ADDRESS = deployedContracts[TARGET_CHAIN_ID]?.BankrBetsPrediction?.address as `0x${string}` | undefined;
const DEPLOY_BLOCK = BigInt(process.env.BANKRBETS_PREDICTION_DEPLOY_BLOCK || "42823800");

const BET_BULL_ABI = parseAbiItem(
  "event BetBull(address indexed sender, address indexed token, uint256 indexed epoch, uint256 amount)",
);
const BET_BEAR_ABI = parseAbiItem(
  "event BetBear(address indexed sender, address indexed token, uint256 indexed epoch, uint256 amount)",
);
const CLAIM_ABI = parseAbiItem(
  "event Claim(address indexed sender, address indexed token, uint256 indexed epoch, uint256 amount)",
);

function makeClient() {
  // Alchemy Free tier limits eth_getLogs to 10-block ranges.
  // Use LOGS_RPC_URL (public Base RPC by default) for unrestricted event scanning.
  const rpcUrl = process.env.LOGS_RPC_URL || "https://base-rpc.publicnode.com";
  return createPublicClient({ chain: base, transport: http(rpcUrl) });
}

export async function GET(req: NextRequest) {
  const userAddress = req.nextUrl.searchParams.get("address");
  if (!userAddress || !isAddress(userAddress)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (!CONTRACT_ADDRESS) {
    return NextResponse.json({ stats: null });
  }

  const client = makeClient();
  const toBlock = await client.getBlockNumber();
  const sender = userAddress as `0x${string}`;

  // Filter logs by the indexed `sender` field — Alchemy handles this efficiently
  // even over large block ranges, so no manual chunking needed.
  const [bullLogs, bearLogs, claimLogs] = await Promise.all([
    client.getLogs({
      address: CONTRACT_ADDRESS,
      event: BET_BULL_ABI,
      args: { sender },
      fromBlock: DEPLOY_BLOCK,
      toBlock,
    }),
    client.getLogs({
      address: CONTRACT_ADDRESS,
      event: BET_BEAR_ABI,
      args: { sender },
      fromBlock: DEPLOY_BLOCK,
      toBlock,
    }),
    client.getLogs({ address: CONTRACT_ADDRESS, event: CLAIM_ABI, args: { sender }, fromBlock: DEPLOY_BLOCK, toBlock }),
  ]);

  let totalBets = 0;
  let totalWagered = 0;
  let totalWon = 0;
  let wins = 0;

  for (const log of [...bullLogs, ...bearLogs]) {
    totalBets++;
    totalWagered += Number((log as any).args?.amount ?? 0n) / 1e6;
  }
  for (const log of claimLogs) {
    const won = Number((log as any).args?.amount ?? 0n) / 1e6;
    if (won > 0) {
      totalWon += won;
      wins++;
    }
  }

  const stats = {
    address: userAddress.toLowerCase(),
    totalBets,
    totalWagered,
    totalWon,
    netPnL: totalWon - totalWagered,
    wins,
    winRate: totalBets > 0 ? (wins / totalBets) * 100 : 0,
  };

  return NextResponse.json(
    { stats },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } },
  );
}
