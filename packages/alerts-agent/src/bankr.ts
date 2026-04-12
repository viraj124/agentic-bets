import { logger } from "./logger.js";

export type Market = {
  token: string;
  symbol: string;
  marketUrl: string;
  poolUsdc: number;
  bullPct: number;
  bearPct: number;
  lockTimestamp: number | null;
  secondsToLock: number | null;
  predictionContract: string;
  status: "not_started" | "open" | "locked" | "settled" | "cancelled";
  epoch: string;
  poolAddress: string;
  creator: string;
  createdAt: number;
  contractVersion: "v1" | "v2";
};

type MarketsResponse = {
  markets: Market[];
  count: number;
  updatedAt: string;
};

export async function fetchMarkets(url: string): Promise<Market[]> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bankr API fetch failed: ${res.status} ${res.statusText} — ${body}`);
  }
  const data = (await res.json()) as MarketsResponse;
  logger.info("Markets fetched", { count: data.count });
  return data.markets;
}
