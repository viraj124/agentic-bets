"use client";

import { useEffect, useRef, useState } from "react";
import { fetchOhlcv } from "./ohlcv";
import { useQuery } from "@tanstack/react-query";

interface PriceChartProps {
  poolAddress: string;
  height?: number;
}

export function PriceChart({ poolAddress, height }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const hasFitRef = useRef(false);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [chartReady, setChartReady] = useState(false);

  // Fetch OHLCV from GeckoTerminal (5-min candles)
  const { data: candles } = useQuery({
    queryKey: ["ohlcv", poolAddress],
    queryFn: () => fetchOhlcv(poolAddress),
    enabled: !!poolAddress,
    refetchInterval: 60000,
    staleTime: 60000,
  });

  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    let cancelled = false;

    const init = async () => {
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

      if (candles && candles.length > 0) {
        seriesRef.current.setData(candles);
        chartRef.current.timeScale().fitContent();
        hasFitRef.current = true;
      }

      setChartReady(true);

      const observer = new ResizeObserver(() => {
        if (!chartRef.current || !chartContainerRef.current) return;
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      });
      observer.observe(chartContainerRef.current);
      resizeObserverRef.current = observer;
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
  }, [candles]);

  useEffect(() => {
    if (!seriesRef.current || !candles || candles.length === 0) return;
    seriesRef.current.setData(candles);
    if (!hasFitRef.current && chartRef.current) {
      chartRef.current.timeScale().fitContent();
      hasFitRef.current = true;
    }
  }, [candles]);

  return (
    <div className="relative w-full" style={{ height: height ? `${height}px` : "18rem" }}>
      <div ref={chartContainerRef} className="w-full h-full" />
      {!chartReady && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="loading loading-spinner loading-md text-base-content/20" />
        </div>
      )}
    </div>
  );
}
