import { NextRequest, NextResponse } from "next/server";
import { type Address, createPublicClient, fallback, formatUnits, http } from "viem";
import { base } from "viem/chains";
import deployedContracts from "~~/contracts/deployedContracts";
import externalContracts from "~~/contracts/externalContracts";

export const maxDuration = 15;

const CHAIN_ID = 8453;
const ORACLE_PAGE_SIZE = 200n;
const ORACLE_MAX_PAGES = 50;
const USDC_DECIMALS = 6;
const CACHE_CONTROL = "public, max-age=10, stale-while-revalidate=20";

const erc20SymbolAbi = [
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
] as const;

type ContractConfig = { address: Address; abi: readonly any[] };
type MarketSource = {
  version: "v1" | "v2";
  oracle: ContractConfig;
  prediction: ContractConfig;
};

type OracleMarketView = {
  token: Address;
  creator: Address;
  poolAddress: Address;
  createdAt: bigint;
};

type RoundView = {
  epoch: bigint;
  startTimestamp: bigint;
  lockTimestamp: bigint;
  closeTimestamp: bigint;
  lockPrice: bigint;
  closePrice: bigint;
  totalAmount: bigint;
  bullAmount: bigint;
  bearAmount: bigint;
  rewardBaseCalAmount: bigint;
  rewardAmount: bigint;
  locked: boolean;
  oracleCalled: boolean;
  cancelled: boolean;
};

type MarketWithSource = OracleMarketView & {
  version: "v1" | "v2";
  prediction: ContractConfig;
};

const alchemyKey = process.env.ALCHEMY_API_KEY;
const baseRpcOverride = process.env.BASE_RPC_URL || process.env.RPC_URL;

const baseClient = createPublicClient({
  chain: base,
  transport: fallback(
    [
      ...(baseRpcOverride ? [http(baseRpcOverride)] : []),
      ...(alchemyKey ? [http(`https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`)] : []),
      http("https://base-rpc.publicnode.com"),
      http("https://mainnet.base.org"),
    ],
    { rank: true },
  ),
});

const v1Contracts = deployedContracts[CHAIN_ID];
const v2Contracts = externalContracts[CHAIN_ID];

const marketSources: MarketSource[] = [
  {
    version: "v1",
    oracle: v1Contracts.BankrBetsOracle as ContractConfig,
    prediction: v1Contracts.BankrBetsPrediction as ContractConfig,
  },
  {
    version: "v2",
    oracle: v2Contracts.BankrBetsOracleV2 as ContractConfig,
    prediction: v2Contracts.BankrBetsPredictionV2 as ContractConfig,
  },
];

function shortAddress(address: Address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function toPercent(part: bigint, total: bigint) {
  if (total <= 0n) return 50;
  return Number((part * 10_000n) / total) / 100;
}

function getAppBaseUrl(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_VERCEL_URL) return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return new URL(request.url).origin;
}

async function getSymbol(token: Address) {
  try {
    return await baseClient.readContract({
      address: token,
      abi: erc20SymbolAbi,
      functionName: "symbol",
    });
  } catch {
    return shortAddress(token);
  }
}

async function fetchOracleMarkets(source: MarketSource): Promise<MarketWithSource[]> {
  const markets: OracleMarketView[] = [];
  let offset = 0n;

  for (let page = 0; page < ORACLE_MAX_PAGES; page++) {
    const pageMarkets = (await baseClient.readContract({
      address: source.oracle.address,
      abi: source.oracle.abi,
      functionName: "getActiveMarketsInfoPage",
      args: [offset, ORACLE_PAGE_SIZE],
    } as any)) as OracleMarketView[];

    if (!pageMarkets.length) break;
    markets.push(...pageMarkets);
    if (pageMarkets.length < Number(ORACLE_PAGE_SIZE)) break;
    offset += BigInt(pageMarkets.length);
  }

  return markets.map(market => ({
    ...market,
    version: source.version,
    prediction: source.prediction,
  }));
}

async function fetchCurrentRound(market: MarketWithSource): Promise<{ epoch: bigint; round: RoundView | null }> {
  const epoch = (await baseClient.readContract({
    address: market.prediction.address,
    abi: market.prediction.abi,
    functionName: "getCurrentEpoch",
    args: [market.token],
  } as any)) as bigint;

  if (epoch === 0n) return { epoch, round: null };

  const round = (await baseClient.readContract({
    address: market.prediction.address,
    abi: market.prediction.abi,
    functionName: "getRound",
    args: [market.token, epoch],
  } as any)) as RoundView;

  return { epoch, round };
}

function getRoundStatus(round: RoundView | null, nowSec: number) {
  if (!round) return "not_started";
  if (round.cancelled) return "cancelled";
  if (round.oracleCalled) return "settled";
  if (round.locked || Number(round.lockTimestamp) <= nowSec) return "locked";
  return "open";
}

export async function GET(request: NextRequest) {
  try {
    const appBaseUrl = getAppBaseUrl(request);
    const nowSec = Math.floor(Date.now() / 1000);

    const sourceResults = await Promise.all(marketSources.map(source => fetchOracleMarkets(source)));
    const byToken = new Map<string, MarketWithSource>();

    // V2 is later in marketSources, so it wins if a token exists in both registries.
    for (const market of sourceResults.flat()) {
      byToken.set(market.token.toLowerCase(), market);
    }

    const markets = await Promise.all(
      Array.from(byToken.values()).map(async market => {
        const [symbol, current] = await Promise.all([getSymbol(market.token), fetchCurrentRound(market)]);
        const round = current.round;
        const totalAmount = round?.totalAmount ?? 0n;
        const bullAmount = round?.bullAmount ?? 0n;
        const bearAmount = round?.bearAmount ?? 0n;
        const lockTimestamp = round ? Number(round.lockTimestamp) : null;
        const secondsToLock = lockTimestamp === null ? null : lockTimestamp - nowSec;
        const marketUrl = `${appBaseUrl}/market#${market.token},${market.poolAddress}`;

        return {
          token: market.token,
          symbol,
          marketUrl,
          poolUsdc: Number(formatUnits(totalAmount, USDC_DECIMALS)),
          bullPct: toPercent(bullAmount, totalAmount),
          bearPct: toPercent(bearAmount, totalAmount),
          lockTimestamp,
          secondsToLock,
          predictionContract: market.prediction.address,
          status: getRoundStatus(round, nowSec),
          epoch: current.epoch.toString(),
          poolAddress: market.poolAddress,
          creator: market.creator,
          createdAt: Number(market.createdAt),
          contractVersion: market.version,
        };
      }),
    );

    return NextResponse.json(
      {
        markets,
        count: markets.length,
        updatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": CACHE_CONTROL } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load Bankr market feed", message: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
