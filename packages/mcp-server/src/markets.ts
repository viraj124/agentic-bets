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

export async function fetchMarkets(apiUrl: string): Promise<Market[]> {
  const res = await fetch(apiUrl, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Markets API failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as MarketsResponse;
  return data.markets;
}

export function formatMarketSummary(m: Market): string {
  const bull = Math.round(m.bullPct);
  const bear = 100 - bull;
  const status = m.status.toUpperCase();
  const timeInfo =
    m.secondsToLock !== null && m.secondsToLock > 0
      ? `Closes in ${m.secondsToLock}s`
      : status;

  return [
    `$${m.symbol} (${m.token})`,
    `Status: ${status} | ${timeInfo}`,
    `Pool: $${m.poolUsdc.toFixed(2)} USDC`,
    `UP: ${bull}% | DOWN: ${bear}%`,
    `Epoch: ${m.epoch} | Contract: ${m.predictionContract}`,
    `Bet: ${m.marketUrl}`,
  ].join("\n");
}
