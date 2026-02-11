import { NextRequest } from "next/server";

interface OhlcvCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { ts: number; data: OhlcvCandle[] }>();

function toCandles(list: number[][]): OhlcvCandle[] {
  return list
    .map(c => ({
      time: c[0],
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
    }))
    .sort((a, b) => a.time - b.time);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pool = searchParams.get("pool");
  const aggregate = searchParams.get("aggregate") || "5";
  const limit = searchParams.get("limit") || "120";
  const currency = searchParams.get("currency") || "usd";

  if (!pool) {
    return Response.json({ error: "Missing pool param" }, { status: 400 });
  }

  const cacheKey = `${pool}-${aggregate}-${limit}-${currency}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return Response.json(cached.data, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
    });
  }

  const url = `https://api.geckoterminal.com/api/v2/networks/base/pools/${pool}/ohlcv/minute?aggregate=${aggregate}&limit=${limit}&currency=${currency}`;

  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) {
    return Response.json([], { status: 200 });
  }

  const json = await res.json();
  const list = (json.data?.attributes?.ohlcv_list || []) as number[][];
  const candles = toCandles(list);
  cache.set(cacheKey, { ts: Date.now(), data: candles });

  return Response.json(candles, {
    headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
  });
}
