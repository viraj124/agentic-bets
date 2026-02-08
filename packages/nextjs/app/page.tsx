"use client";

import Link from "next/link";
import type { NextPage } from "next";
import { TrendingTokens } from "~~/components/bankrbets/TrendingTokens";
import { useEligibleTokens } from "~~/hooks/bankrbets/useEligibleTokens";

const Home: NextPage = () => {
  const { tokenCount } = useEligibleTokens();

  return (
    <div className="flex flex-col grow">
      {/* Hero */}
      <div className="px-6 pt-10 pb-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">Predict token prices</h1>
          <p className="text-base text-base-content/50 max-w-lg mb-4">
            Permissionless prediction markets for any token on Base. Create a market, earn 0.5% forever. Pick UP or
            DOWN, win USDC in 5-minute rounds.
          </p>
          <Link
            href="/market"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Create a market
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Stats bar */}
      <div className="max-w-7xl mx-auto w-full px-6 pb-6">
        <div className="flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-base-content/50">Live on Base</span>
          </div>
          <div className="text-base-content/50">5-min rounds</div>
          <div className="text-base-content/50">2.1% fee (1.5% treasury + 0.5% creator + 0.1% settler)</div>
          {tokenCount > 0 && (
            <div className="text-primary font-medium">
              {tokenCount} live market{tokenCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>

      {/* Token grid */}
      <div className="max-w-7xl mx-auto w-full px-6 pb-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold">Trending tokens</h2>
          <span className="text-xs text-base-content/40">Clanker + GeckoTerminal</span>
        </div>
        <TrendingTokens />
      </div>

      {/* How it works */}
      <div className="border-t border-base-300 px-6 py-12">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xl font-semibold mb-8 text-center">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              {
                step: "01",
                title: "Pick a token",
                desc: "Browse trending tokens or create a new market for any token",
              },
              { step: "02", title: "Bet UP or DOWN", desc: "Predict where the price goes in 5 minutes using USDC" },
              { step: "03", title: "Anyone settles", desc: "Lock & close rounds on-chain. Settlers earn 0.1% reward" },
              {
                step: "04",
                title: "Collect winnings",
                desc: "Winners split the losing side's pool. Creators earn 0.5%",
              },
            ].map(item => (
              <div key={item.step} className="text-center">
                <div className="text-3xl font-bold text-primary/20 mb-2">{item.step}</div>
                <h3 className="font-semibold mb-1 text-sm">{item.title}</h3>
                <p className="text-xs text-base-content/50 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
