"use client";

import { useEffect, useRef, useState } from "react";
import { fetchOhlcv } from "./ohlcv";
import { useQuery } from "@tanstack/react-query";

interface PriceChartProps {
  poolAddress: string;
  tokenAddress?: string;
  height?: number;
  currentPrice?: number;
  lockPrice?: number;
  isLocked?: boolean;
  epoch?: number;
}

export function PriceChart({
  poolAddress,
  tokenAddress,
  height,
  currentPrice,
  lockPrice,
  isLocked,
  epoch,
}: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const liveSeriesRef = useRef<any>(null);
  const lockLineRef = useRef<any>(null);
  const hasFitRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const livePointsRef = useRef<{ time: number; value: number }[]>([]);
  const lastEpochRef = useRef<number | undefined>(undefined);
  const [chartReady, setChartReady] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const DOT_COLOR = "#8b5cf6";
  const [dotPos, setDotPos] = useState<{ x: number; y: number } | null>(null);

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

  // Chart initialization
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    let cancelled = false;

    const init = async () => {
      try {
        const { createChart, CandlestickSeries, LineSeries } = await import("lightweight-charts");
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

        liveSeriesRef.current = chartRef.current.addSeries(LineSeries, {
          color: "#8b5cf6",
          lineWidth: 2,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
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
        liveSeriesRef.current = null;
        lockLineRef.current = null;
      }
    };
  }, []);

  // Update OHLCV candle data
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

  // Live price overlay — updates on every GeckoTerminal poll (every 5s)
  useEffect(() => {
    if (!liveSeriesRef.current || !currentPrice || currentPrice <= 0) {
      setDotPos(null);
      return;
    }

    // Reset live points when epoch changes (new round started)
    if (epoch !== lastEpochRef.current) {
      livePointsRef.current = [];
      lastEpochRef.current = epoch;
      if (lockLineRef.current) {
        try {
          liveSeriesRef.current.removePriceLine(lockLineRef.current);
        } catch {
          /* ignore */
        }
        lockLineRef.current = null;
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const pts = livePointsRef.current;

    // Deduplicate: update last point if same second, otherwise append
    if (pts.length > 0 && pts[pts.length - 1].time >= now) {
      pts[pts.length - 1].value = currentPrice;
    } else {
      pts.push({ time: now, value: currentPrice });
    }

    // Cap at ~2 hours of 5s samples
    if (pts.length > 1440) pts.splice(0, pts.length - 1440);

    try {
      liveSeriesRef.current.setData([...pts]);

      liveSeriesRef.current.applyOptions({ color: DOT_COLOR });

      // Dashed amber lock price line
      if (isLocked && lockPrice && lockPrice > 0 && !lockLineRef.current) {
        lockLineRef.current = liveSeriesRef.current.createPriceLine({
          price: lockPrice,
          color: "#f59e0b",
          lineWidth: 1,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: "Lock",
        });
      } else if ((!isLocked || !lockPrice) && lockLineRef.current) {
        try {
          liveSeriesRef.current.removePriceLine(lockLineRef.current);
        } catch {
          /* ignore */
        }
        lockLineRef.current = null;
      }

      // Position pulsing dot at the latest live point
      if (chartRef.current && pts.length > 0) {
        const lastPt = pts[pts.length - 1];
        const x = chartRef.current.timeScale().timeToCoordinate(lastPt.time);
        const y = liveSeriesRef.current.priceToCoordinate(currentPrice);
        if (x !== null && x !== undefined && y !== null && y !== undefined) {
          setDotPos({ x, y });
        } else {
          setDotPos(null);
        }
      }
    } catch {
      setDotPos(null);
    }
  }, [currentPrice, lockPrice, isLocked, epoch]);

  return (
    <div className="relative w-full" style={{ height: height ? `${height}px` : "18rem" }}>
      <div ref={chartContainerRef} className={`w-full h-full ${shouldShowFallback ? "pointer-events-none" : ""}`} />

      {/* Pulsing live price beacon */}
      {dotPos && !shouldShowLoader && !shouldShowFallback && (
        <div
          className="absolute pointer-events-none"
          style={{ left: `${dotPos.x}px`, top: `${dotPos.y}px`, transform: "translate(-50%, -50%)", zIndex: 9 }}
        >
          <span
            className="absolute inline-flex h-3 w-3 rounded-full animate-ping opacity-60"
            style={{ backgroundColor: DOT_COLOR }}
          />
          <span
            className="relative inline-flex h-3 w-3 rounded-full ring-2 ring-white/20"
            style={{ backgroundColor: DOT_COLOR }}
          />
        </div>
      )}

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
