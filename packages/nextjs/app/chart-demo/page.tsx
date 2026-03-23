"use client";

/**
 * TEMPORARY DEMO PAGE — delete this file after review.
 * Route: /chart-demo
 *
 * Full market page preview with mock chart + mock BetPanel.
 * No wallet / on-chain state required.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const BASE_PRICE = 0.00412;
const CANDLE_INTERVAL = 300;

function generateMockCandles(count: number) {
  const now = Math.floor(Date.now() / 1000);
  const candles = [];
  let price = BASE_PRICE;
  for (let i = count; i >= 1; i--) {
    const time = now - i * CANDLE_INTERVAL;
    const open = price;
    const drift = (Math.random() - 0.47) * 0.00006;
    const close = Math.max(open + drift, 0.0001);
    const high = Math.max(open, close) + Math.random() * 0.000025;
    const low = Math.min(open, close) - Math.random() * 0.000025;
    candles.push({
      time,
      open: +open.toFixed(8),
      high: +high.toFixed(8),
      low: +low.toFixed(8),
      close: +close.toFixed(8),
    });
    price = close;
  }
  return { candles, lastPrice: price };
}

type RoundMode = "open" | "bull" | "bear";

function fmt(secs: number) {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function ChartDemoPage() {
  // Chart refs
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const liveSeriesRef = useRef<any>(null);
  const lockLineRef = useRef<any>(null);
  const livePointsRef = useRef<{ time: number; value: number }[]>([]);
  const livePriceRef = useRef(BASE_PRICE);

  // Chart state
  const DOT_COLOR = "#8b5cf6";
  const [dotPos, setDotPos] = useState<{ x: number; y: number } | null>(null);
  const [chartReady, setChartReady] = useState(false);

  // Round / demo state (shared between chart + bet panel)
  const [mode, setMode] = useState<RoundMode>("open");
  const [epoch, setEpoch] = useState(1);
  const [lockPrice, setLockPrice] = useState<number | null>(null);
  const [currentPrice, setCurrentPrice] = useState(BASE_PRICE);
  const [countdown, setCountdown] = useState(300);

  // Bet panel state
  const [direction, setDirection] = useState<"bull" | "bear" | null>(null);
  const [mockAmount, setMockAmount] = useState("");
  const [mockBetPlaced, setMockBetPlaced] = useState<{ direction: "bull" | "bear"; amount: string } | null>(null);

  // Pool mock
  const bullPercent = mode === "bear" ? 36 : mode === "bull" ? 64 : 50;
  const bearPercent = 100 - bullPercent;
  const totalPool = 1234.56;
  const bullPool = (totalPool * bullPercent) / 100;
  const bearPool = (totalPool * bearPercent) / 100;

  // Countdown timer
  useEffect(() => {
    setCountdown(300);
    const id = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [mode, epoch]);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;
    let cancelled = false;
    const init = async () => {
      try {
        const { createChart, CandlestickSeries, LineSeries } = await import("lightweight-charts");
        if (cancelled || !containerRef.current) return;
        chartRef.current = createChart(containerRef.current, {
          layout: { background: { color: "transparent" }, textColor: "#9ca3af", fontSize: 11 },
          grid: { vertLines: { color: "rgba(156,163,175,0.08)" }, horzLines: { color: "rgba(156,163,175,0.08)" } },
          crosshair: { vertLine: { labelBackgroundColor: "#14b8a6" }, horzLine: { labelBackgroundColor: "#14b8a6" } },
          rightPriceScale: { borderColor: "rgba(156,163,175,0.15)" },
          timeScale: { borderColor: "rgba(156,163,175,0.15)", timeVisible: true, secondsVisible: false },
          handleScale: { axisPressedMouseMove: true },
          handleScroll: { vertTouchDrag: false },
        });
        const { candles, lastPrice } = generateMockCandles(60);
        livePriceRef.current = lastPrice;
        setCurrentPrice(lastPrice);
        candleSeriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
          upColor: "#10b981",
          downColor: "#ef4444",
          borderUpColor: "#10b981",
          borderDownColor: "#ef4444",
          wickUpColor: "#10b981",
          wickDownColor: "#ef4444",
        });
        candleSeriesRef.current.setData(candles);
        liveSeriesRef.current = chartRef.current.addSeries(LineSeries, {
          color: DOT_COLOR,
          lineWidth: 2,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        chartRef.current.timeScale().fitContent();
        const observer = new ResizeObserver(() => {
          if (chartRef.current && containerRef.current)
            chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
        });
        observer.observe(containerRef.current);
        setChartReady(true);
      } catch (e) {
        console.error("Chart init failed", e);
      }
    };
    init();
    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candleSeriesRef.current = null;
        liveSeriesRef.current = null;
        lockLineRef.current = null;
      }
    };
  }, []);

  // Live price tick every 2s
  useEffect(() => {
    if (!chartReady) return;
    const tick = () => {
      if (!liveSeriesRef.current) return;
      const bias = mode === "bull" ? 0.54 : mode === "bear" ? 0.44 : 0.5;
      livePriceRef.current = Math.max(livePriceRef.current + (Math.random() - bias) * 0.000018, 0.0001);
      const price = livePriceRef.current;
      setCurrentPrice(price);
      const now = Math.floor(Date.now() / 1000);
      const pts = livePointsRef.current;
      if (pts.length > 0 && pts[pts.length - 1].time >= now) pts[pts.length - 1].value = price;
      else pts.push({ time: now, value: price });
      if (pts.length > 600) pts.splice(0, pts.length - 600);
      try {
        liveSeriesRef.current.setData([...pts]);
        liveSeriesRef.current.applyOptions({ color: DOT_COLOR });
        const isLocked = mode !== "open";
        if (isLocked && lockPrice && lockPrice > 0 && !lockLineRef.current) {
          lockLineRef.current = liveSeriesRef.current.createPriceLine({
            price: lockPrice,
            color: "#f59e0b",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: "Lock",
          });
        } else if (!isLocked && lockLineRef.current) {
          try {
            liveSeriesRef.current.removePriceLine(lockLineRef.current);
          } catch {
            /* noop */
          }
          lockLineRef.current = null;
        }
        if (chartRef.current && pts.length > 0) {
          const lastPt = pts[pts.length - 1];
          const x = chartRef.current.timeScale().timeToCoordinate(lastPt.time);
          const y = liveSeriesRef.current.priceToCoordinate(price);
          if (x != null && y != null) setDotPos({ x, y });
          else setDotPos(null);
        }
      } catch {
        /* noop */
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [chartReady, mode, lockPrice]);

  const handleModeChange = (newMode: RoundMode) => {
    if (newMode !== "open" && mode === "open") {
      setLockPrice(livePriceRef.current);
      if (lockLineRef.current && liveSeriesRef.current) {
        try {
          liveSeriesRef.current.removePriceLine(lockLineRef.current);
        } catch {
          /* noop */
        }
        lockLineRef.current = null;
      }
    } else if (newMode === "open") {
      setLockPrice(null);
      if (lockLineRef.current && liveSeriesRef.current) {
        try {
          liveSeriesRef.current.removePriceLine(lockLineRef.current);
        } catch {
          /* noop */
        }
        lockLineRef.current = null;
      }
    }
    setMode(newMode);
    setMockBetPlaced(null);
    setDirection(null);
    setMockAmount("");
  };

  const handleNewRound = () => {
    livePointsRef.current = [];
    if (lockLineRef.current && liveSeriesRef.current) {
      try {
        liveSeriesRef.current.removePriceLine(lockLineRef.current);
      } catch {
        /* noop */
      }
      lockLineRef.current = null;
    }
    if (liveSeriesRef.current)
      try {
        liveSeriesRef.current.setData([]);
      } catch {
        /* noop */
      }
    setLockPrice(null);
    setMode("open");
    setEpoch(e => e + 1);
    setDotPos(null);
    setMockBetPlaced(null);
    setDirection(null);
    setMockAmount("");
  };

  const isLocked = mode !== "open";
  const isUrgent = countdown <= 30;

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-xs text-pg-muted hover:text-base-content transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-base-content" style={{ fontFamily: "var(--font-heading)" }}>
                WCHAN / USD
              </h1>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-pg-mint/15 text-pg-mint rounded-full px-2.5 py-0.5 border border-pg-mint/30">
                <span className="w-1.5 h-1.5 rounded-full bg-pg-mint animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-[10px] text-pg-amber/80 font-bold mt-0.5">DEMO — mock data only</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right mr-2">
            <p className="text-xl font-extrabold font-mono text-base-content">${currentPrice.toFixed(6)}</p>
            <p className="text-xs text-pg-mint font-bold">
              +2.14% <span className="text-pg-muted font-normal">1h</span>
            </p>
          </div>

          {/* Demo controls */}
          <div className="flex items-center gap-1.5 border-2 border-pg-border rounded-xl p-1.5">
            <button
              onClick={() => handleModeChange("open")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${mode === "open" ? "bg-pg-violet/15 text-pg-violet" : "text-pg-muted hover:text-base-content"}`}
            >
              Open
            </button>
            <button
              onClick={() => handleModeChange("bull")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${mode === "bull" ? "bg-pg-mint/15 text-pg-mint" : "text-pg-muted hover:text-base-content"}`}
            >
              Locked↑
            </button>
            <button
              onClick={() => handleModeChange("bear")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${mode === "bear" ? "bg-pg-pink/15 text-pg-pink" : "text-pg-muted hover:text-base-content"}`}
            >
              Locked↓
            </button>
            <div className="w-px h-4 bg-pg-border mx-0.5" />
            <button
              onClick={handleNewRound}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-pg-muted hover:text-base-content transition-all"
            >
              New →
            </button>
          </div>
        </div>
      </div>

      {/* Main grid — mirrors real market page */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Chart */}
        <div className="lg:col-span-2">
          <div className="bg-base-100 rounded-2xl border-2 border-pg-border overflow-hidden">
            <div className="px-5 py-3 border-b-2 border-pg-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className="text-sm font-extrabold text-base-content"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Price chart
                </span>
                <span className="text-[11px] font-bold bg-pg-violet/10 text-pg-violet rounded-full px-2 py-0.5 border border-pg-violet/20">
                  Epoch #{epoch}
                </span>
              </div>
              {lockPrice && (
                <span className="text-[11px] font-bold text-pg-amber font-mono">Lock ${lockPrice.toFixed(6)}</span>
              )}
            </div>

            <div className="relative" style={{ height: "22rem" }}>
              <div ref={containerRef} className="w-full h-full" />
              {dotPos && chartReady && (
                <div
                  className="absolute pointer-events-none"
                  style={{ left: `${dotPos.x}px`, top: `${dotPos.y}px`, transform: "translate(-50%,-50%)", zIndex: 9 }}
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
            </div>
          </div>
        </div>

        {/* Right: Mock BetPanel */}
        <div>
          <div className="bg-base-100 rounded-2xl border-2 border-pg-border overflow-hidden">
            {/* Timer */}
            <div className="px-5 py-4 border-b-2 border-pg-border bg-base-200/30 text-center">
              <p className="text-[10px] font-bold text-pg-muted uppercase tracking-wider mb-1">
                {isLocked ? "Round ends in" : "Betting closes in"}
              </p>
              <p
                className={`text-3xl font-mono font-bold tabular-nums ${isUrgent ? "text-pg-pink animate-pulse" : "text-base-content"}`}
              >
                {fmt(countdown)}
              </p>
              <p className="text-[11px] text-pg-muted/50 mt-0.5">{isLocked ? "Bets locked" : "Place your bets"}</p>
            </div>

            <div className="p-4 space-y-4">
              {mockBetPlaced ? (
                /* Position placed */
                <div className="py-4 text-center">
                  <p className="text-[10px] font-bold text-pg-muted uppercase tracking-widest mb-2">Your position</p>
                  <p className="text-3xl font-extrabold font-mono" style={{ fontFamily: "var(--font-heading)" }}>
                    ${mockBetPlaced.amount}
                  </p>
                  <span
                    className={`inline-block mt-1.5 px-3 py-0.5 rounded-full text-sm font-bold border ${
                      mockBetPlaced.direction === "bull"
                        ? "bg-pg-mint/15 text-pg-mint border-pg-mint/30"
                        : "bg-pg-pink/15 text-pg-pink border-pg-pink/30"
                    }`}
                  >
                    {mockBetPlaced.direction === "bull" ? "↑ UP" : "↓ DOWN"}
                  </span>
                  <p className="text-xs text-pg-muted/50 mt-3">Waiting for settlement</p>
                  <button
                    onClick={() => setMockBetPlaced(null)}
                    className="mt-3 text-[11px] text-pg-muted/50 hover:text-pg-muted no-underline"
                  >
                    reset demo
                  </button>
                </div>
              ) : !isLocked ? (
                <>
                  {/* Outcome cards */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => setDirection(d => (d === "bull" ? null : "bull"))}
                      className={`p-3.5 rounded-xl border-2 text-left transition-all ${
                        direction === "bull"
                          ? "border-pg-mint bg-pg-mint/10"
                          : "border-pg-border hover:border-pg-mint/40 bg-base-200/30"
                      }`}
                    >
                      <p className="text-[11px] font-bold text-pg-mint mb-1">↑ UP</p>
                      <p
                        className="text-2xl font-extrabold text-base-content"
                        style={{ fontFamily: "var(--font-heading)" }}
                      >
                        {bullPercent}%
                      </p>
                      <p className="text-[11px] text-pg-muted mt-0.5">${bullPool.toFixed(0)} pool</p>
                    </button>

                    <button
                      onClick={() => setDirection(d => (d === "bear" ? null : "bear"))}
                      className={`p-3.5 rounded-xl border-2 text-left transition-all ${
                        direction === "bear"
                          ? "border-pg-pink bg-pg-pink/10"
                          : "border-pg-border hover:border-pg-pink/40 bg-base-200/30"
                      }`}
                    >
                      <p className="text-[11px] font-bold text-pg-pink mb-1">↓ DOWN</p>
                      <p
                        className="text-2xl font-extrabold text-base-content"
                        style={{ fontFamily: "var(--font-heading)" }}
                      >
                        {bearPercent}%
                      </p>
                      <p className="text-[11px] text-pg-muted mt-0.5">${bearPool.toFixed(0)} pool</p>
                    </button>
                  </div>

                  {/* Pool bar */}
                  <div className="w-full h-1 bg-pg-pink/25 rounded-full overflow-hidden -mt-1">
                    <div
                      className="h-full bg-pg-mint rounded-full transition-all duration-500"
                      style={{ width: `${bullPercent}%` }}
                    />
                  </div>

                  {/* Amount */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-pg-muted uppercase tracking-widest">
                        Amount (USDC)
                      </span>
                      <span className="text-[11px] text-pg-muted/60 font-mono">$250.00</span>
                    </div>
                    <div className="flex gap-1.5 mb-2">
                      {[5, 10, 25, 50].map(v => (
                        <button
                          key={v}
                          onClick={() => setMockAmount(v.toString())}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-lg border-2 transition-all ${
                            mockAmount === v.toString()
                              ? "border-pg-violet bg-pg-violet/10 text-pg-violet"
                              : "border-pg-border text-pg-muted hover:border-pg-violet/30"
                          }`}
                        >
                          ${v}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      value={mockAmount}
                      onChange={e => setMockAmount(e.target.value)}
                      placeholder="0.00"
                      min="1"
                      step="1"
                      className="w-full bg-base-200/50 border-2 border-pg-border rounded-xl px-3 py-2.5 text-base font-mono focus:outline-none focus:border-pg-violet/50 transition-colors"
                    />
                  </div>

                  {/* Buy button */}
                  <button
                    onClick={() => {
                      if (direction && mockAmount) setMockBetPlaced({ direction, amount: mockAmount });
                    }}
                    disabled={!direction || !mockAmount}
                    className={`w-full py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      !direction
                        ? "bg-base-300 text-pg-muted"
                        : direction === "bull"
                          ? "bg-pg-mint hover:bg-pg-mint/90"
                          : "bg-pg-pink hover:bg-pg-pink/90"
                    }`}
                  >
                    {!direction
                      ? "Select UP or DOWN"
                      : `Bet ${direction === "bull" ? "↑ UP" : "↓ DOWN"}${mockAmount ? ` · $${mockAmount}` : ""}`}
                  </button>

                  {/* Footer */}
                  <div className="pt-3 border-t-2 border-pg-border/40 flex items-center justify-between text-[10px] text-pg-muted/50">
                    <span>Round #{epoch}</span>
                    <span>2.1% fee</span>
                  </div>
                </>
              ) : (
                /* Locked — no betting */
                <div className="py-8 text-center">
                  <p className="text-sm font-bold text-pg-muted">Betting closed</p>
                  <p className="text-xs text-pg-muted/50 mt-1">Waiting for settlement</p>
                  {lockPrice && (
                    <p className="text-[11px] font-mono text-pg-amber mt-3">Lock price ${lockPrice.toFixed(6)}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-6 text-[10px] text-pg-muted/40 text-center">
        Delete <code className="font-mono">/app/chart-demo/page.tsx</code> after review
      </p>
    </div>
  );
}
