"use client";

import { useEffect, useRef, useState } from "react";
import { fetchOhlcv } from "./ohlcv";
import { useQuery } from "@tanstack/react-query";

interface PriceChartProps {
  poolAddress: string;
  tokenAddress?: string;
  height?: number;
  compact?: boolean; // true for mini 200px cards — fetches fewer candles at lower resolution
  currentPrice?: number;
  lockPrice?: number;
  isLocked?: boolean;
  epoch?: number;
}

export function PriceChart({
  poolAddress,
  tokenAddress,
  height,
  compact,
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
  const chartHeight = height ?? 288;

  // Fetch OHLCV from GeckoTerminal
  // compact mode: 15-min candles (faster, smaller payload for mini home-page charts)
  // full mode:    5-min candles (detail page)
  const {
    data: candles,
    isLoading: isLoadingCandles,
    isFetching: isFetchingCandles,
  } = useQuery({
    queryKey: ["ohlcv", poolAddress, tokenAddress, compact],
    queryFn: () => fetchOhlcv(poolAddress, tokenAddress, compact),
    enabled: !!poolAddress,
    refetchInterval: compact ? 5 * 60_000 : 60_000, // mini charts refetch every 5 min
    staleTime: compact ? 5 * 60_000 : 60_000,
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
        const resizeChart = () => {
          if (!chartRef.current || !chartContainerRef.current) return;
          const width = Math.max(
            1,
            Math.floor(
              chartContainerRef.current.clientWidth || chartContainerRef.current.getBoundingClientRect().width || 1,
            ),
          );
          const measuredHeight = chartContainerRef.current.clientHeight || chartHeight;
          chartRef.current.applyOptions({ width, height: Math.max(1, Math.floor(measuredHeight)) });
        };
        const initialWidth = Math.max(
          1,
          Math.floor(
            chartContainerRef.current.clientWidth || chartContainerRef.current.getBoundingClientRect().width || 1,
          ),
        );

        chartRef.current = createChart(chartContainerRef.current, {
          width: initialWidth,
          height: chartHeight,
          layout: {
            background: { color: "transparent" },
            textColor: "#9ca3af",
            fontSize: 11,
            attributionLogo: false,
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
          resizeChart();
        });
        observer.observe(chartContainerRef.current);
        resizeObserverRef.current = observer;
        resizeChart();
        requestAnimationFrame(resizeChart);
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
  }, [chartHeight]);

  // Update OHLCV candle data
  useEffect(() => {
    if (!chartReady || !seriesRef.current || !candles || candles.length === 0) return;
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
  }, [candles, chartReady]);

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
    <div className="relative w-full" style={{ height: `${chartHeight}px` }}>
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
        <div className="absolute inset-0 z-20 pointer-events-auto flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <div className="w-10 h-10 rounded-2xl bg-pg-border/40 border-2 border-pg-border flex items-center justify-center">
              <svg
                className="w-5 h-5 text-pg-muted/40"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-pg-muted" style={{ fontFamily: "var(--font-heading)" }}>
                No chart data
              </p>
              <p className="text-[11px] text-pg-muted/50 mt-0.5">
                {chartError ?? "Price history not available for this pool"}
              </p>
            </div>
            {externalLink && (
              <a
                href={externalLink.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pg-violet/10 border border-pg-violet/20 text-[11px] font-bold text-pg-violet hover:bg-pg-violet/20 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                  />
                </svg>
                {externalLink.label.replace(/^[^\s]+\s/, "")}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
