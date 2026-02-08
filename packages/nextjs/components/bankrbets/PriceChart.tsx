"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface OhlcvCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface PriceChartProps {
  poolAddress: string;
}

export function PriceChart({ poolAddress }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartReady, setChartReady] = useState(false);

  // Fetch OHLCV from GeckoTerminal (5-min candles)
  const { data: candles } = useQuery({
    queryKey: ["ohlcv", poolAddress],
    queryFn: async (): Promise<OhlcvCandle[]> => {
      const res = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/base/pools/${poolAddress}/ohlcv/minute?aggregate=5&limit=200&currency=usd`,
      );
      if (!res.ok) throw new Error("Failed to fetch OHLCV");
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
    },
    enabled: !!poolAddress,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  useEffect(() => {
    if (!chartContainerRef.current || !candles || candles.length === 0) return;

    let chart: any;
    let series: any;

    const init = async () => {
      const { createChart, CandlestickSeries } = await import("lightweight-charts");

      chart = createChart(chartContainerRef.current!, {
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

      series = chart.addSeries(CandlestickSeries, {
        upColor: "#10b981",
        downColor: "#ef4444",
        borderUpColor: "#10b981",
        borderDownColor: "#ef4444",
        wickUpColor: "#10b981",
        wickDownColor: "#ef4444",
      });

      series.setData(candles);
      chart.timeScale().fitContent();
      setChartReady(true);
    };

    init();

    const handleResize = () => {
      if (chart && chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (chart) chart.remove();
    };
  }, [candles]);

  return (
    <div className="relative w-full h-72">
      <div ref={chartContainerRef} className="w-full h-full" />
      {!chartReady && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="loading loading-spinner loading-md text-base-content/20" />
        </div>
      )}
    </div>
  );
}
