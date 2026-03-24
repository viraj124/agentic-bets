"use client";

import type { NextPage } from "next";
import { TrendingTokens } from "~~/components/bankrbets/TrendingTokens";

const STEPS = [
  {
    n: "01",
    t: "Pick a token",
    d: "Browse Agentic ecosystem tokens and create prediction markets",
    color: "bg-pg-violet",
    shadow: "shadow-pop-violet",
  },
  {
    n: "02",
    t: "Bet UP or DOWN",
    d: "Predict price direction in 4-minute betting windows",
    color: "bg-pg-pink",
    shadow: "shadow-pop-pink",
  },
  {
    n: "03",
    t: "Anyone settles",
    d: "Settle rounds on-chain and earn 0.1% reward",
    color: "bg-pg-amber",
    shadow: "shadow-pop",
  },
  {
    n: "04",
    t: "Collect winnings",
    d: "Winners split the pool. Creators earn 0.5% forever",
    color: "bg-pg-mint",
    shadow: "shadow-pop-soft",
  },
];

const Home: NextPage = () => {
  return (
    <div className="flex flex-col grow">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div className="relative px-6 pt-8 md:pt-12 pb-6 overflow-hidden">
        {/* Floating geometric decorations */}
        <div className="absolute top-6 right-[15%] w-16 h-16 rounded-full bg-pg-amber/20 border-2 border-pg-amber/30 motion-safe:animate-float hidden md:block" />
        <div className="absolute top-20 right-[8%] w-8 h-8 rounded-lg bg-pg-pink/20 border-2 border-pg-pink/30 rotate-12 motion-safe:animate-float-slow hidden md:block" />

        <div className="max-w-5xl mx-auto relative">
          <div className="mb-3">
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-base-content">
              Agentic <span className="text-pg-violet">Bets</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-pg-mint/15 text-pg-mint rounded-full px-3 py-1 border border-pg-mint/30">
                <span className="w-1.5 h-1.5 rounded-full bg-pg-mint motion-safe:animate-pulse" />
                Live on Base
              </span>
              <span className="inline-flex items-center text-[11px] font-bold bg-pg-amber/15 text-[#9a7200] rounded-full px-3 py-1 border border-pg-amber/30">
                4-min bet rounds
              </span>
            </div>
          </div>

          <p className="text-sm md:text-base text-pg-muted max-w-lg leading-relaxed">
            4 min prediction markets for <span className="text-pg-violet font-semibold">Bankr</span> ecosystem tokens.
          </p>
        </div>
      </div>

      {/* ── Token List ────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto w-full px-6 pb-10 flex-1">
        <TrendingTokens />
      </div>

      {/* ── How it works ──────────────────────────────────────────── */}
      <div className="relative px-6 py-10 md:py-14 bg-dots">
        {/* Decorative squiggle divider */}
        <div className="absolute top-0 left-0 right-0 h-px bg-pg-border" />

        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <h2
              className="text-xl font-extrabold text-base-content uppercase tracking-wide"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              How it works
            </h2>
            <div className="h-1 w-12 rounded-full bg-pg-violet" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((item, i) => (
              <div
                key={item.n}
                className={`motion-safe:animate-pop-in stagger-${i + 1} group card-sticker p-5 cursor-default`}
              >
                {/* Step number badge */}
                <div
                  className={`inline-flex items-center justify-center w-9 h-9 rounded-full ${item.color} border-2 border-pg-slate mb-3`}
                >
                  <span className="text-white text-xs font-extrabold" style={{ fontFamily: "var(--font-heading)" }}>
                    {item.n}
                  </span>
                </div>

                <h3 className="font-bold text-sm text-base-content mb-1" style={{ fontFamily: "var(--font-heading)" }}>
                  {item.t}
                </h3>
                <p className="text-xs text-pg-muted leading-relaxed">{item.d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
