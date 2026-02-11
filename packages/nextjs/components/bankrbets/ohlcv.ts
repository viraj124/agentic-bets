export interface OhlcvCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

async function fetchFromApi(poolAddress: string): Promise<OhlcvCandle[]> {
  try {
    const res = await fetch(`/api/ohlcv?pool=${poolAddress}&aggregate=5&limit=120&currency=usd`);
    if (!res.ok) return [];
    const data = (await res.json()) as OhlcvCandle[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchFromGecko(poolAddress: string): Promise<OhlcvCandle[]> {
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/base/pools/${poolAddress}/ohlcv/minute?aggregate=5&limit=120&currency=usd`,
    );
    if (!res.ok) return [];
    const json = await res.json();
    const list = json.data?.attributes?.ohlcv_list || [];
    return list
      .map((c: number[]) => ({
        time: c[0],
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
      }))
      .sort((a: OhlcvCandle, b: OhlcvCandle) => a.time - b.time);
  } catch {
    return [];
  }
}

export async function fetchOhlcv(poolAddress: string): Promise<OhlcvCandle[]> {
  if (!poolAddress) return [];
  const apiData = await fetchFromApi(poolAddress);
  if (apiData.length > 0) return apiData;
  return await fetchFromGecko(poolAddress);
}
