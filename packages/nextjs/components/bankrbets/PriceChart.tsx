"use client";

import { useEffect, useRef, useState } from "react";
import { fetchOhlcv } from "./ohlcv";
import { useQuery } from "@tanstack/react-query";

interface PriceChartProps {
  poolAddress: string;
  tokenAddress?: string;
  height?: number;
}

export function PriceChart({ poolAddress, tokenAddress, height }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const hasFitRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  // Fetch OHLCV from GeckoTerminal (5-min candles)
  const {
    data: candles,
    isLoading: isLoadingCandles,
    isFetching: isFetchingCandles,
  } = useQuery({
    queryKey: ["ohlcv", poolAddress, tokenAddress],
    queryFn: () => fetchOhlcv(poolAddress, tokenAddress),
    enabled: !!poolAddress,
    refetchInterval: 60000,
    staleTime: 60000,
  });

  const hasCandleData = (candles?.length ?? 0) > 0;
  const shouldShowLoader = !chartReady || isLoadingCandles || (isFetchingCandles && !hasCandleData);
  const shouldShowFallback = chartReady && !shouldShowLoader && (!hasCandleData || !!chartError);

  const normalizedPool = poolAddress.toLowerCase();
  const normalizedToken = tokenAddress?.toLowerCase() || "";
  const geckoUrl = /^0x[a-f0-9]{40}$|^0x[a-f0-9]{64}$/.test(normalizedPool)
    ? `https://www.geckoterminal.com/base/pools/${normalizedPool}`
    : null;
  let dexUrl: string | null = null;
  if (normalizedToken && /^0x[a-f0-9]{40}$/.test(normalizedToken)) {
    dexUrl = `https://dexscreener.com/base/${normalizedToken}`;
  }
  const externalLink = geckoUrl
    ? { href: geckoUrl, label: "🦎 View on CoinGecko" }
    : dexUrl
      ? { href: dexUrl, label: "📊 View on DexScreener" }
      : null;

  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    let cancelled = false;

    const init = async () => {
      try {
        const { createChart, CandlestickSeries } = await import("lightweight-charts");
        if (cancelled || !chartContainerRef.current) return;

        chartRef.current = createChart(chartContainerRef.current, {
          layout: {
            background: { color: "transparent" },
            textColor: "#9ca3af",
            fontSize: 11,
          },
          grid: {
            vertLines: { color: "rgba(156, 163, 175, 0.08)" },
            horzLines: { color: "rgba(156, 163, 175, 0.08)" },
          },
          crosshair: {
            vertLine: { labelBackgroundColor: "#14b8a6" },
            horzLine: { labelBackgroundColor: "#14b8a6" },
          },
          rightPriceScale: {
            borderColor: "rgba(156, 163, 175, 0.15)",
          },
          timeScale: {
            borderColor: "rgba(156, 163, 175, 0.15)",
            timeVisible: true,
            secondsVisible: false,
          },
          handleScale: { axisPressedMouseMove: true },
          handleScroll: { vertTouchDrag: false },
        });

        seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
          upColor: "#10b981",
          downColor: "#ef4444",
          borderUpColor: "#10b981",
          borderDownColor: "#ef4444",
          wickUpColor: "#10b981",
          wickDownColor: "#ef4444",
        });

        const observer = new ResizeObserver(() => {
          if (!chartRef.current || !chartContainerRef.current) return;
          chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
        });
        observer.observe(chartContainerRef.current);
        resizeObserverRef.current = observer;
      } catch {
        setChartError("Chart unavailable");
      } finally {
        setChartReady(true);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !candles || candles.length === 0) return;
    try {
      seriesRef.current.setData(candles);
      if (!hasFitRef.current && chartRef.current) {
        chartRef.current.timeScale().fitContent();
        hasFitRef.current = true;
      }
      setChartError(null);
    } catch {
      setChartError("Unable to render chart data");
    }
  }, [candles]);

  return (
    <div className="relative w-full" style={{ height: height ? `${height}px` : "18rem" }}>
      <div ref={chartContainerRef} className={`w-full h-full ${shouldShowFallback ? "pointer-events-none" : ""}`} />
      {shouldShowLoader && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <span className="loading loading-spinner loading-md text-base-content/20" />
        </div>
      )}

      {shouldShowFallback && (
        <div className="absolute inset-0 z-20 p-3 pointer-events-auto">
          <div className="h-full w-full rounded-xl border border-pg-border bg-base-200/70 backdrop-blur-[1px] px-4 py-3 flex flex-col justify-center">
            <p className="text-xs font-semibold text-pg-muted text-center mb-3">Price history not available</p>
            {chartError && <p className="text-[11px] text-pg-muted/80 text-center mb-2">{chartError}</p>}

            {externalLink && (
              <div className="flex items-center justify-center mt-1">
                <a
                  href={externalLink.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pointer-events-auto text-xs font-semibold text-pg-violet hover:text-pg-violet/70 underline cursor-pointer"
                >
                  {externalLink.label}
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
