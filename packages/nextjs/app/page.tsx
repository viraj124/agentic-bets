"use client";

import type { NextPage } from "next";
import {
  ArrowTrendingUpIcon,
  ChevronDownIcon,
  CircleStackIcon,
  QuestionMarkCircleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { MarketStats } from "~~/components/bankrbets/MarketStats";
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
    d: "Predict price direction in 5-minute betting windows",
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

const LIQUIDITY_POINTS = [
  {
    title: "Direct Uniswap V4 pricing",
    description:
      "Every lock price and close price is read on-chain from the linked Uniswap V4 pool. There is no off-chain oracle fallback.",
    accent: "bg-pg-violet/10 text-pg-violet border-pg-violet/20",
    icon: CircleStackIcon,
  },
  {
    title: "Pool activity matters",
    description:
      "Rounds depend on the underlying pool state. If the pool sees little trading between lock and close, the price may finish flat.",
    accent: "bg-pg-amber/10 text-[#9a7200] border-pg-amber/20",
    icon: ArrowTrendingUpIcon,
  },
  {
    title: "Liquidity guardrails",
    description:
      "Markets require a valid initialized V4 pool, can enforce minimum liquidity, and can cancel rounds if price moves are too extreme.",
    accent: "bg-pg-mint/10 text-pg-mint border-pg-mint/20",
    icon: ShieldCheckIcon,
  },
];

const FAQ_ITEMS = [
  {
    question: "Does creating a market start round 1?",
    answer:
      "No. Creating a market only registers the token and pool. The first round starts when the first bet is placed.",
  },
  {
    question: "How do ties work?",
    answer:
      "The protocol supports two tie modes. In Refund mode, a flat finish cancels the round and both sides claim back their stake. In MajorityWins mode, a flat finish pays the side with more USDC; if both sides are exactly equal, the round is cancelled and refunded.",
  },
  {
    question: "What is the live tie mode right now?",
    answer: "The current Base deployment uses MajorityWins. So a flat price does not automatically mean a refund.",
  },
  {
    question: "When do both sides get refunded?",
    answer:
      "Both sides refund when the round is cancelled. That includes equal-sided ties under MajorityWins, any tie under Refund mode, expired rounds that enter the refund path, no-winner rounds, and rounds cancelled by safety checks.",
  },
  {
    question: "Why can a flat round still show a winner?",
    answer:
      "Under MajorityWins, if the close price equals the lock price but one side had more USDC in the pool, that side wins the round.",
  },
  {
    question: "Why does Rabby show the market token as the receiver on claim?",
    answer:
      "That preview is misleading. The claim call takes the market token address as its first argument, and Rabby appears to label that generic address field as Receiver. The actual USDC payout is sent by the contract to msg.sender, which is the connected wallet claiming.",
  },
  {
    question: "Do markets depend on real pool activity?",
    answer:
      "Yes. Prices come straight from Uniswap V4 pool state. If liquidity is weak or trading is inactive, price discovery is weaker and flat finishes become more likely.",
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
                5-min bet rounds
              </span>
            </div>
          </div>

          <p className="text-sm md:text-base text-pg-muted max-w-lg leading-relaxed">
            5 min prediction markets for <span className="text-pg-violet font-semibold">Bankr</span> ecosystem tokens.
          </p>

          <MarketStats />
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

      {/* ── Liquidity ─────────────────────────────────────────────── */}
      <section id="liquidity" className="relative scroll-mt-28 px-6 py-10 md:py-14">
        <div className="absolute inset-x-0 top-0 h-px bg-pg-border" />

        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-pg-amber/25 bg-pg-amber/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#9a7200]">
                <CircleStackIcon className="h-3.5 w-3.5" />
                Liquidity
              </div>
              <h2
                className="mt-3 text-2xl md:text-3xl font-extrabold tracking-tight text-base-content"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Uniswap V4 pool activity drives the market
              </h2>
            </div>
            <p className="max-w-xl text-sm text-pg-muted leading-relaxed">
              Agentic Bets reads price directly from the linked Uniswap V4 pool. That keeps settlement on-chain, but it
              also means market quality depends on real liquidity and real trading activity.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_0.75fr] gap-5">
            <div className="rounded-[28px] border-2 border-pg-border bg-base-100/90 p-6 shadow-pop-soft">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {LIQUIDITY_POINTS.map(item => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className={`rounded-2xl border p-4 ${item.accent}`}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 shrink-0" />
                        <h3
                          className="text-sm font-extrabold text-base-content"
                          style={{ fontFamily: "var(--font-heading)" }}
                        >
                          {item.title}
                        </h3>
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-pg-muted">{item.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[28px] border-2 border-pg-border bg-base-100/90 p-6 shadow-pop-soft">
              <p
                className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-pg-violet"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Practical impact
              </p>
              <ul className="mt-4 space-y-3 text-sm text-pg-muted leading-relaxed">
                <li className="rounded-2xl border border-pg-border bg-base-200/35 px-4 py-3">
                  A valid initialized V4 pool is required to create and price a market.
                </li>
                <li className="rounded-2xl border border-pg-border bg-base-200/35 px-4 py-3">
                  Thin pools can finish flat more often, which makes tie handling more visible.
                </li>
                <li className="rounded-2xl border border-pg-border bg-base-200/35 px-4 py-3">
                  Safety checks can cancel rounds when price movement looks too extreme for a healthy market.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <section id="faq" className="relative scroll-mt-28 px-6 py-10 md:py-14 bg-dots">
        <div className="absolute inset-x-0 top-0 h-px bg-pg-border" />

        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-pg-pink/25 bg-pg-pink/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-pg-pink">
                <QuestionMarkCircleIcon className="h-3.5 w-3.5" />
                FAQ
              </div>
              <h2
                className="mt-3 text-2xl md:text-3xl font-extrabold tracking-tight text-base-content"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Important edge cases, explained clearly
              </h2>
            </div>
            <p className="max-w-xl text-sm text-pg-muted leading-relaxed">
              These are the cases users usually get confused by: tie handling, refunds, claim previews, and how much the
              app depends on the underlying pool.
            </p>
          </div>

          <div className="space-y-3">
            {FAQ_ITEMS.map((item, index) => (
              <details
                key={item.question}
                className="group rounded-[24px] border-2 border-pg-border bg-base-100/90 px-5 py-4 shadow-pop-soft open:shadow-pop"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pg-violet text-xs font-extrabold text-white">
                      {(index + 1).toString().padStart(2, "0")}
                    </div>
                    <h3
                      className="text-left text-sm md:text-base font-extrabold text-base-content"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      {item.question}
                    </h3>
                  </div>
                  <ChevronDownIcon className="h-5 w-5 shrink-0 text-pg-muted transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <p className="pt-4 pl-11 text-sm leading-relaxed text-pg-muted">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
