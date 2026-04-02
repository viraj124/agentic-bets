"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import confetti from "canvas-confetti";
import { AgenticBetsLogo } from "~~/components/assets/AgenticBetsLogo";
import { useGeckoTerminal } from "~~/hooks/bankrbets/useGeckoTerminal";

interface BetCardViewProps {
  token: string;
  side: "UP" | "DOWN";
  amount: string;
  outcome: "won" | "lost" | "pending" | "claimed";
  payout?: string;
  img?: string;
  marketToken?: string;
}

export function BetCardView({ token, side, amount, outcome, payout, img, marketToken }: BetCardViewProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const normalizedToken = token.trim().replace(/^\$/, "");
  const normalizedTokenSymbol = normalizedToken.toUpperCase();
  const explicitTokenImg = img && img !== "undefined" && img !== "null" ? img : "";
  const { data: tokenPoolData } = useGeckoTerminal(undefined, !explicitTokenImg ? marketToken : undefined);
  const { data: bankrTokenImg } = useQuery({
    queryKey: ["bet-card-token-image", marketToken, normalizedTokenSymbol],
    queryFn: async () => {
      if (!marketToken && !normalizedTokenSymbol) return "";
      const res = await fetch("/api/bankr-tokens");
      if (!res.ok) return "";
      const json = (await res.json()) as {
        tokens?: Array<{ address: string; symbol?: string; imgUrl?: string }>;
      };
      const match = (json.tokens || []).find(t => {
        const addressMatches =
          !!marketToken && typeof t.address === "string" && t.address.toLowerCase() === marketToken.toLowerCase();
        const symbolMatches =
          typeof t.symbol === "string" && t.symbol.trim().replace(/^\$/, "").toUpperCase() === normalizedTokenSymbol;
        return addressMatches || symbolMatches;
      });
      return match?.imgUrl || "";
    },
    enabled: !explicitTokenImg && !tokenPoolData?.imageUrl && (!!marketToken || !!normalizedTokenSymbol),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));

    const isWin = outcome === "won" || outcome === "claimed";
    if (isWin) {
      const timer = setTimeout(() => {
        const burst = (opts: confetti.Options) => confetti({ ...opts, disableForReducedMotion: true });
        burst({ particleCount: 80, spread: 70, origin: { y: 0.5 } });
        setTimeout(() => burst({ particleCount: 50, spread: 100, origin: { y: 0.55, x: 0.25 } }), 150);
        setTimeout(() => burst({ particleCount: 50, spread: 100, origin: { y: 0.55, x: 0.75 } }), 300);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [outcome]);

  const isUp = side === "UP";
  const isWon = outcome === "won" || outcome === "claimed";
  const isLost = outcome === "lost";

  const sideColor = isUp ? "text-pg-mint" : "text-pg-pink";
  const sideBg = isUp ? "bg-pg-mint/10 border-pg-mint/30" : "bg-pg-pink/10 border-pg-pink/30";

  const outcomeColor = isWon ? "text-pg-mint" : isLost ? "text-pg-pink" : "text-pg-amber";
  const outcomeBg = isWon
    ? "bg-pg-mint/10 border-pg-mint/40"
    : isLost
      ? "bg-pg-pink/10 border-pg-pink/40"
      : "bg-pg-amber/10 border-pg-amber/40";
  const outcomeLabel = isWon ? (outcome === "claimed" ? "CLAIMED" : "WON") : isLost ? "LOST" : "PENDING";

  const profit = isWon && payout && amount ? (parseFloat(payout) - parseFloat(amount)).toFixed(2) : null;
  const resolvedTokenImg = explicitTokenImg || tokenPoolData?.imageUrl || bankrTokenImg || "";

  const handleNavigate = () => {
    if (marketToken) {
      router.push(`/market#${marketToken}`);
    } else {
      router.push("/");
    }
  };

  return (
    <div className="min-h-screen bg-base-200 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Dot grid background matching app theme */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(circle, var(--color-pg-border) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Floating geometric decorations */}
      <div className="absolute top-[10%] left-[8%] w-20 h-20 rounded-full bg-pg-amber/20 border-2 border-pg-amber/30 motion-safe:animate-float" />
      <div className="absolute top-[18%] right-[10%] w-10 h-10 rounded-lg bg-pg-pink/20 border-2 border-pg-pink/30 rotate-12 motion-safe:animate-float-slow" />
      <div className="absolute bottom-[15%] left-[12%] w-12 h-12 rounded-lg bg-pg-violet/20 border-2 border-pg-violet/30 -rotate-6 motion-safe:animate-float-slow" />
      <div className="absolute bottom-[22%] right-[8%] w-16 h-16 rounded-full bg-pg-mint/20 border-2 border-pg-mint/30 motion-safe:animate-float" />
      <div className="absolute top-[45%] left-[4%] w-6 h-6 rounded-full bg-pg-pink/15 border-2 border-pg-pink/20 motion-safe:animate-float" />
      <div className="absolute top-[40%] right-[5%] w-8 h-8 rounded-lg bg-pg-amber/15 border-2 border-pg-amber/20 rotate-45 motion-safe:animate-float-slow" />

      {/* ═══ Card ═══ */}
      <div
        className={`relative w-full max-w-[420px] bg-base-100 rounded-2xl border-2 border-pg-border overflow-hidden transition-all duration-700 ease-out ${
          mounted ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-8 scale-95"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b-2 border-pg-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0">
              <AgenticBetsLogo className="w-8 h-8" />
            </div>
            <span
              className="text-base font-extrabold text-base-content tracking-tight"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              AgenticBets
            </span>
          </div>
          <div className={`flex items-center gap-1.5 ${outcomeBg} border rounded-full px-3 py-1`}>
            <span
              className={`w-1.5 h-1.5 rounded-full ${isWon ? "bg-pg-mint" : isLost ? "bg-pg-pink" : "bg-pg-amber"} ${!isWon && !isLost ? "animate-pulse" : ""}`}
            />
            <span className={`text-xs font-extrabold ${outcomeColor} tracking-wider`}>{outcomeLabel}</span>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          {/* Token row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {resolvedTokenImg ? (
                <img
                  src={resolvedTokenImg}
                  alt={token}
                  className="w-12 h-12 rounded-xl border-2 border-pg-border object-cover"
                />
              ) : (
                <div
                  className={`w-12 h-12 rounded-xl border-2 border-pg-border flex items-center justify-center text-xl font-extrabold ${sideColor} bg-base-200 shrink-0`}
                >
                  {token.charAt(0)}
                </div>
              )}
              <div>
                <p
                  className="text-2xl font-extrabold text-base-content tracking-tight leading-none"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  ${token}
                </p>
                <p className="text-xs text-pg-muted mt-0.5">Prediction Market</p>
              </div>
            </div>
            {/* Direction badge */}
            <div className={`flex items-center gap-1.5 ${sideBg} border-2 rounded-xl px-3.5 py-2`}>
              <span className={`text-lg ${sideColor}`}>{isUp ? "▲" : "▼"}</span>
              <span className={`text-lg font-extrabold ${sideColor}`} style={{ fontFamily: "var(--font-heading)" }}>
                {side}
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-3">
            {/* Wager */}
            <div
              className={`flex-1 rounded-xl p-3.5 border-2 border-pg-border bg-base-200 transition-all duration-500 delay-200 ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
            >
              <p className="text-[10px] font-bold text-pg-muted uppercase tracking-widest mb-1">Wager</p>
              <p
                className="text-xl font-extrabold text-base-content tracking-tight"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                ${amount}
              </p>
              <p className="text-[10px] font-semibold text-pg-muted">USDC</p>
            </div>

            {/* Payout / Loss / Pending */}
            <div
              className={`flex-1 rounded-xl p-3.5 border-2 transition-all duration-500 delay-300 ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              } ${
                isWon
                  ? "bg-pg-mint/5 border-pg-mint/30"
                  : isLost
                    ? "bg-pg-pink/5 border-pg-pink/30"
                    : "bg-base-200 border-pg-border"
              }`}
            >
              {isWon && payout ? (
                <>
                  <p className="text-[10px] font-bold text-pg-mint uppercase tracking-widest mb-1">Payout</p>
                  <p
                    className="text-xl font-extrabold text-pg-mint tracking-tight"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    ${payout}
                  </p>
                  <p className="text-[10px] font-bold text-pg-mint/70">
                    {profit && parseFloat(profit) > 0 ? `+$${profit} profit` : "USDC"}
                  </p>
                </>
              ) : isLost ? (
                <>
                  <p className="text-[10px] font-bold text-pg-pink uppercase tracking-widest mb-1">Result</p>
                  <p
                    className="text-xl font-extrabold text-pg-pink tracking-tight"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    -${amount}
                  </p>
                  <p className="text-[10px] font-semibold text-pg-pink/70">USDC</p>
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm font-bold text-pg-amber">Awaiting result...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CTA Button */}
      <button
        onClick={handleNavigate}
        className={`mt-6 px-6 py-3 rounded-xl bg-pg-violet hover:bg-pg-violet/90 text-white font-bold text-sm transition-all duration-500 delay-500 shadow-pop hover:shadow-pop-active active:translate-x-[2px] active:translate-y-[2px] border-2 border-pg-slate ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
        style={{ fontFamily: "var(--font-heading)" }}
      >
        {isWon ? "Try your luck" : "Place a bet"}
      </button>
    </div>
  );
}
