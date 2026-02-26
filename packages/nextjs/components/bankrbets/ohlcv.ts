export interface OhlcvCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeCandles(candles: OhlcvCandle[]): OhlcvCandle[] {
  const normalized = candles
    .map(c => ({
      time: Math.floor(toNumber(c.time)),
      open: toNumber(c.open),
      high: toNumber(c.high),
      low: toNumber(c.low),
      close: toNumber(c.close),
    }))
    .filter(c => c.time > 0 && [c.open, c.high, c.low, c.close].every(Number.isFinite))
    .sort((a, b) => a.time - b.time);

  const deduped: OhlcvCandle[] = [];
  let lastTime = -1;
  for (const candle of normalized) {
    if (candle.time === lastTime && deduped.length > 0) {
      deduped[deduped.length - 1] = candle;
      continue;
    }
    deduped.push(candle);
    lastTime = candle.time;
  }

  if (deduped.length === 1) {
    const single = deduped[0];
    deduped.unshift({ ...single, time: Math.max(0, single.time - 300) });
  }

  return deduped;
}

async function fetchFromApi(poolAddress: string, tokenAddress?: string, compact?: boolean): Promise<OhlcvCandle[]> {
  try {
    const params = new URLSearchParams({
      pool: poolAddress,
      // compact: 15-min × 48 bars ≈ 12 h — faster for mini charts
      // full:    5-min × 120 bars ≈ 10 h — for the detail page chart
      aggregate: compact ? "15" : "5",
      limit: compact ? "48" : "120",
      currency: "usd",
    });
    if (tokenAddress) params.set("token", tokenAddress);

    const res = await fetch(`/api/ohlcv?${params.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as OhlcvCandle[];
    return Array.isArray(data) ? sanitizeCandles(data) : [];
  } catch {
    return [];
  }
}

export async function fetchOhlcv(
  poolAddress: string,
  tokenAddress?: string,
  compact?: boolean,
): Promise<OhlcvCandle[]> {
  if (!poolAddress) return [];
  return await fetchFromApi(poolAddress, tokenAddress, compact);
}
