"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type OhlcvCandle, fetchOhlcv } from "./ohlcv";
import { useQuery } from "@tanstack/react-query";

interface PriceChartProps {
  poolAddress: string;
  tokenAddress?: string;
  height?: number;
  compact?: boolean; // true for mini 200px cards — fetches fewer candles at lower resolution
}

type DetailRange = "1h" | "6h" | "1d" | "1w" | "1m" | "all";

const DETAIL_RANGE_OPTIONS: { value: DetailRange; label: string }[] = [
  { value: "1h", label: "1H" },
  { value: "6h", label: "6H" },
  { value: "1d", label: "1D" },
  { value: "1w", label: "1W" },
  { value: "1m", label: "1M" },
  { value: "all", label: "ALL" },
];

type DetailRangeConfig = {
  aggregateMinutes: number;
  limit: number;
  windowSeconds: number;
  showDateInTooltip: boolean;
};

const DETAIL_RANGE_CONFIG: Record<DetailRange, DetailRangeConfig> = {
  "1h": { aggregateMinutes: 1, limit: 120, windowSeconds: 60 * 60, showDateInTooltip: false },
  "6h": { aggregateMinutes: 5, limit: 96, windowSeconds: 6 * 60 * 60, showDateInTooltip: false },
  "1d": { aggregateMinutes: 15, limit: 120, windowSeconds: 24 * 60 * 60, showDateInTooltip: false },
  "1w": { aggregateMinutes: 60, limit: 200, windowSeconds: 7 * 24 * 60 * 60, showDateInTooltip: true },
  "1m": { aggregateMinutes: 240, limit: 220, windowSeconds: 30 * 24 * 60 * 60, showDateInTooltip: true },
  all: { aggregateMinutes: 1440, limit: 365, windowSeconds: 0, showDateInTooltip: true },
};

const DOT_COLOR = "#8b5cf6";

function formatUsdPrice(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  const absValue = Math.abs(value);
  if (absValue >= 1) return `$${value.toFixed(4)}`;
  if (absValue >= 0.01) return `$${value.toFixed(6)}`;
  // For very small prices, show 3 significant digits after leading zeros
  if (absValue === 0) return "$0.00";
  const str = absValue.toExponential();
  const exp = parseInt(str.split("e")[1], 10);
  const sigDigits = Math.max(3, Math.abs(exp) + 3);
  return `$${value.toFixed(Math.min(sigDigits, 15))}`;
}

function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function normalizeCrosshairTime(value: any): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (value && typeof value === "object" && "year" in value && "month" in value && "day" in value) {
    const year = Number((value as any).year);
    const month = Number((value as any).month);
    const day = Number((value as any).day);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }
    return Math.floor(Date.UTC(year, month - 1, day) / 1000);
  }

  return null;
}

function formatCrosshairTime(timestamp: number, range: DetailRange): string {
  const date = new Date(timestamp * 1000);
  const formatConfig = DETAIL_RANGE_CONFIG[range];
  return formatConfig.showDateInTooltip
    ? date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function PriceChart({ poolAddress, tokenAddress, height, compact }: PriceChartProps) {
  const isDetailChart = !compact;

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const hasFitRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const isNarrowRef = useRef(false);
  const selectedRangeRef = useRef<DetailRange>("1h");
  const [chartReady, setChartReady] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<DetailRange>("1h");
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    price: number;
    timeLabel: string;
    flipBelow: boolean;
  } | null>(null);
  const chartHeight = height ?? 288;
  const detailRangeConfig = DETAIL_RANGE_CONFIG[selectedRange];

  useEffect(() => {
    selectedRangeRef.current = selectedRange;
  }, [selectedRange]);

  // Fetch OHLCV from GeckoTerminal
  // compact mode: 15-min candles (faster, smaller payload for mini home-page charts)
  // full mode:    5-min candles (detail page)
  const {
    data: candles,
    isLoading: isLoadingCandles,
    isFetching: isFetchingCandles,
  } = useQuery({
    queryKey: [
      "ohlcv",
      poolAddress,
      tokenAddress,
      compact,
      isDetailChart ? detailRangeConfig.aggregateMinutes : "compact",
      isDetailChart ? detailRangeConfig.limit : "compact",
    ],
    queryFn: () =>
      fetchOhlcv(
        poolAddress,
        tokenAddress,
        compact,
        isDetailChart
          ? { aggregateMinutes: detailRangeConfig.aggregateMinutes, limit: detailRangeConfig.limit }
          : undefined,
      ),
    enabled: !!poolAddress,
    retry: 1,
    retryDelay: attemptIndex => Math.min(2000 * 2 ** attemptIndex, 10_000),
    // Retry empty charts after 2 min; normal refetch every 5-10 min.
    refetchInterval: query =>
      query.state.data && query.state.data.length > 0 ? (compact ? 10 * 60_000 : 5 * 60_000) : 2 * 60_000,
    staleTime: compact ? 10 * 60_000 : 5 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: previousData => previousData,
  });

  const hasCandleData = (candles?.length ?? 0) > 0;
  const shouldShowLoader = !chartReady || isLoadingCandles || (isFetchingCandles && !hasCandleData);
  const shouldShowFallback = chartReady && !shouldShowLoader && (!hasCandleData || !!chartError);
  const hasRenderableChartData = hasCandleData && !chartError;

  const visibleCandles = useMemo<OhlcvCandle[]>(() => candles ?? [], [candles]);

  const mainSeriesData = useMemo(() => {
    if (visibleCandles.length === 0) return [];
    if (!isDetailChart) return visibleCandles;
    return visibleCandles.map(candle => ({
      time: candle.time,
      value: candle.close,
    }));
  }, [visibleCandles, isDetailChart]);

  const rangeStats = useMemo(() => {
    if (!isDetailChart || visibleCandles.length < 2) return null;
    const startPrice = visibleCandles[0].close;
    const endPrice = visibleCandles[visibleCandles.length - 1].close;
    if (!Number.isFinite(startPrice) || startPrice <= 0 || !Number.isFinite(endPrice)) return null;
    const changePercent = ((endPrice - startPrice) / startPrice) * 100;
    return {
      changePercent,
      isPositive: changePercent >= 0,
    };
  }, [isDetailChart, visibleCandles]);

  const showDetailControls =
    isDetailChart && chartReady && hasCandleData && !shouldShowLoader && !shouldShowFallback && !chartError;
  const latestDisplayPrice = useMemo(() => {
    const latestCandle = visibleCandles[visibleCandles.length - 1];
    return latestCandle?.close ?? 0;
  }, [visibleCandles]);

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
    ? { href: geckoUrl, label: "View on CoinGecko" }
    : dexUrl
      ? { href: dexUrl, label: "View on DexScreener" }
      : null;

  // Chart initialization
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    let cancelled = false;

    const init = async () => {
      try {
        const { createChart, AreaSeries, CandlestickSeries } = await import("lightweight-charts");
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

        const isNarrow = initialWidth < 400;
        isNarrowRef.current = isNarrow;

        chartRef.current = createChart(chartContainerRef.current, {
          width: initialWidth,
          height: chartHeight,
          layout: {
            background: { color: "transparent" },
            textColor: isDetailChart ? "#7f8899" : "#9ca3af",
            fontSize: isNarrow ? 9 : 11,
            attributionLogo: false,
          },
          grid: {
            vertLines: { color: isDetailChart ? "rgba(139, 92, 246, 0.04)" : "rgba(156, 163, 175, 0.08)" },
            horzLines: { color: isDetailChart ? "rgba(139, 92, 246, 0.06)" : "rgba(156, 163, 175, 0.08)" },
          },
          crosshair: {
            vertLine: { labelBackgroundColor: DOT_COLOR },
            horzLine: { labelBackgroundColor: DOT_COLOR },
          },
          rightPriceScale: {
            borderColor: isDetailChart ? "rgba(139, 92, 246, 0.22)" : "rgba(156, 163, 175, 0.15)",
            scaleMargins: isDetailChart ? { top: 0.08, bottom: 0.08 } : undefined,
          },
          timeScale: {
            borderColor: isDetailChart ? "rgba(139, 92, 246, 0.22)" : "rgba(156, 163, 175, 0.15)",
            timeVisible: true,
            secondsVisible: false,
            rightOffset: isDetailChart ? 4 : undefined,
            barSpacing: isDetailChart ? 14 : undefined,
            minBarSpacing: isDetailChart ? 8 : undefined,
            tickMarkFormatter: (time: any, tickMarkType: number) => {
              let date: Date;
              if (typeof time === "number") {
                date = new Date(time * 1000);
              } else if (time && typeof time === "object" && "year" in time) {
                date = new Date(Date.UTC(time.year, time.month - 1, time.day ?? 1));
              } else {
                return null;
              }

              const range = selectedRangeRef.current;
              // tickMarkType: 0=Year, 1=Month, 2=DayOfMonth, 3=Time, 4=TimeWithSeconds

              if (range === "1h" || range === "6h" || range === "1d") {
                // Short ranges: times as primary, dates on day boundaries
                if (tickMarkType === 3 || tickMarkType === 4)
                  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                if (tickMarkType === 2) return date.toLocaleDateString([], { month: "short", day: "numeric" });
                return null;
              }

              if (range === "1w") {
                // Week: show day names with date
                if (tickMarkType === 2) return date.toLocaleDateString([], { weekday: "short", day: "numeric" });
                if (tickMarkType === 1) return date.toLocaleDateString([], { month: "short" });
                if (tickMarkType === 3) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                return null;
              }

              if (range === "1m") {
                // Month: show dates, months on boundaries
                if (tickMarkType === 2) return date.toLocaleDateString([], { month: "short", day: "numeric" });
                if (tickMarkType === 1) return date.toLocaleDateString([], { month: "short" });
                return null;
              }

              // ALL: months as primary, year on boundaries
              if (tickMarkType === 1) return date.toLocaleDateString([], { month: "short", year: "2-digit" });
              if (tickMarkType === 2) return date.toLocaleDateString([], { month: "short", day: "numeric" });
              if (tickMarkType === 0) return String(date.getFullYear());
              return null;
            },
          },
          localization: {
            priceFormatter: formatUsdPrice,
          },
          handleScale: { axisPressedMouseMove: true },
          handleScroll: { vertTouchDrag: false },
        });

        if (isDetailChart) {
          seriesRef.current = chartRef.current.addSeries(AreaSeries, {
            lineColor: DOT_COLOR,
            lineWidth: 3,
            topColor: "rgba(139, 92, 246, 0.34)",
            bottomColor: "rgba(139, 92, 246, 0.01)",
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 3,
            crosshairMarkerBorderColor: DOT_COLOR,
            crosshairMarkerBackgroundColor: "#ede9fe",
            priceLineVisible: false,
            lastValueVisible: false,
          });
        } else {
          seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
            upColor: "#10b981",
            downColor: "#ef4444",
            borderUpColor: "#10b981",
            borderDownColor: "#ef4444",
            wickUpColor: "#10b981",
            wickDownColor: "#ef4444",
          });
        }

        if (isDetailChart) {
          const handleCrosshairMove = (param: any) => {
            if (!chartContainerRef.current) {
              setHoverInfo(null);
              return;
            }

            const point = param?.point;
            const timeValue = normalizeCrosshairTime(param?.time);
            if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !timeValue) {
              setHoverInfo(null);
              return;
            }

            const width = chartContainerRef.current.clientWidth || 0;
            const height = chartContainerRef.current.clientHeight || 0;
            if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) {
              setHoverInfo(null);
              return;
            }

            const areaData = param?.seriesData?.get?.(seriesRef.current);
            const hoveredPrice =
              typeof areaData?.value === "number"
                ? areaData.value
                : typeof areaData?.close === "number"
                  ? areaData.close
                  : undefined;

            if (hoveredPrice === undefined || !Number.isFinite(hoveredPrice)) {
              setHoverInfo(null);
              return;
            }

            const tooltipHalfW = isNarrowRef.current ? 48 : 72;
            const clampedX = Math.max(tooltipHalfW, Math.min(width - tooltipHalfW, point.x));
            const clampedY = Math.max(28, Math.min(height - 28, point.y));
            setHoverInfo({
              x: clampedX,
              y: clampedY,
              price: hoveredPrice,
              timeLabel: formatCrosshairTime(timeValue, selectedRangeRef.current),
              flipBelow: point.y < 60,
            });
          };

          chartRef.current.subscribeCrosshairMove(handleCrosshairMove);
        }

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
        setHoverInfo(null);
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [chartHeight, isDetailChart]);

  // Update timeScale options when range changes
  useEffect(() => {
    if (!chartReady || !chartRef.current || !isDetailChart) return;
    // Show time ticks for 1H/6H/1D; hide for 1W/1M/ALL so date labels dominate
    const showTime = selectedRange === "1h" || selectedRange === "6h" || selectedRange === "1d";
    chartRef.current.applyOptions({
      timeScale: { timeVisible: showTime, secondsVisible: false },
    });
  }, [chartReady, isDetailChart, selectedRange]);

  // Update OHLCV data in the main chart series
  useEffect(() => {
    if (!chartReady || !seriesRef.current) return;

    if (!hasRenderableChartData || mainSeriesData.length === 0) {
      try {
        seriesRef.current.setData([]);
      } catch {
        // ignore
      }
      return;
    }

    try {
      seriesRef.current.setData(mainSeriesData);

      if (isDetailChart && chartRef.current) {
        const lastCandle = mainSeriesData[mainSeriesData.length - 1];
        const firstCandle = mainSeriesData[0];
        const lastTime = typeof lastCandle?.time === "number" ? lastCandle.time : ((lastCandle as any)?.time ?? 0);
        const firstTime = typeof firstCandle?.time === "number" ? firstCandle.time : ((firstCandle as any)?.time ?? 0);

        let rangeSet = false;
        if (lastTime > 0 && detailRangeConfig.windowSeconds > 0) {
          // Clamp the window start to the first candle so setVisibleRange
          // never requests a range entirely outside the data.
          const idealFrom = lastTime - detailRangeConfig.windowSeconds;
          const from = Math.max(idealFrom, firstTime) as any;
          const to = (lastTime + 60) as any;
          try {
            chartRef.current.timeScale().setVisibleRange({ from, to });
            rangeSet = true;
          } catch {
            // setVisibleRange can throw if range doesn't overlap data — fall through
          }
        }
        if (!rangeSet) {
          chartRef.current.timeScale().fitContent();
        }
      } else if (!hasFitRef.current && chartRef.current) {
        chartRef.current.timeScale().fitContent();
        hasFitRef.current = true;
      }
      setChartError(null);
    } catch {
      setChartError("Unable to render chart data");
    }
  }, [chartReady, hasRenderableChartData, isDetailChart, mainSeriesData, detailRangeConfig.windowSeconds]);

  return (
    <div
      className={`relative w-full ${isDetailChart ? "bg-gradient-to-b from-pg-violet/8 via-transparent to-transparent" : ""}`}
      style={{ height: `${chartHeight}px` }}
    >
      {showDetailControls && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-2 sm:px-4 pt-2 sm:pt-3">
          <div className="pointer-events-auto overflow-x-auto rounded-lg sm:rounded-xl border border-pg-violet/25 bg-base-100/90 p-0.5 sm:p-1 shadow-sm backdrop-blur-sm flex-shrink-0">
            <div className="inline-flex items-center gap-0.5 sm:gap-1">
              {DETAIL_RANGE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedRange(option.value)}
                  className={`px-1.5 sm:px-2.5 py-1 rounded-md sm:rounded-lg text-[9px] sm:text-[10px] font-bold transition-colors ${
                    selectedRange === option.value
                      ? "bg-pg-violet text-white shadow-sm"
                      : "text-pg-muted hover:text-base-content hover:bg-pg-violet/10"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink min-w-0">
            {rangeStats && latestDisplayPrice > 0 && (
              <div className="rounded-lg sm:rounded-xl border border-pg-violet/20 bg-base-100/90 px-2 sm:px-3 py-1 sm:py-1.5 text-right shadow-sm backdrop-blur-sm">
                <p
                  className="text-[9px] sm:text-[10px] font-bold text-base-content truncate"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {formatUsdPrice(latestDisplayPrice)}
                </p>
                <p
                  className={`text-[9px] sm:text-[10px] font-bold ${rangeStats.isPositive ? "text-pg-violet" : "text-pg-pink"}`}
                >
                  {formatPercent(rangeStats.changePercent)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={chartContainerRef} className={`w-full h-full ${shouldShowFallback ? "pointer-events-none" : ""}`} />

      {hoverInfo && !shouldShowLoader && !shouldShowFallback && (
        <div
          className={`pointer-events-none absolute z-20 -translate-x-1/2 rounded-lg border border-pg-violet/25 bg-base-100/95 px-2.5 py-1.5 shadow-sm backdrop-blur-sm ${hoverInfo.flipBelow ? "translate-y-[15%]" : "-translate-y-[115%]"}`}
          style={{ left: `${hoverInfo.x}px`, top: `${hoverInfo.y}px` }}
        >
          <p className="text-[10px] font-bold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
            {formatUsdPrice(hoverInfo.price)}
          </p>
          <p className="text-[10px] text-pg-muted">{hoverInfo.timeLabel}</p>
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
                {externalLink.label}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
