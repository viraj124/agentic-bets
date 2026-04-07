"use client";

import { useCallback, useState } from "react";
import type { NextPage } from "next";
import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";

const AGBETS_TOKEN_CA = "0x37d183FCf1DA460a64D21E754b3E6144C4e11BA3";
const GECKO_EMBED_URL = `https://www.geckoterminal.com/base/pools/${AGBETS_TOKEN_CA}?embed=1&info=0&swaps=0&grayscale=0&light_chart=0`;

const TokenPage: NextPage = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(AGBETS_TOKEN_CA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const short = `${AGBETS_TOKEN_CA.slice(0, 10)}...${AGBETS_TOKEN_CA.slice(-4)}`;

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Decorative background shapes */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-10 top-20 h-40 w-40 rounded-full bg-pg-pink/[0.06]" />
        <div className="absolute left-24 top-10 h-6 w-6 rotate-45 rounded-sm bg-pg-violet/[0.10]" />
        <div className="absolute left-12 top-64 h-4 w-4 rounded-full bg-pg-mint/[0.15]" />
        <div className="absolute -right-12 top-32 h-48 w-48 rounded-full bg-pg-violet/[0.05]" />
        <div className="absolute right-24 top-8 h-5 w-5 rounded-full bg-pg-amber/[0.12]" />
        <div className="absolute right-16 top-56 h-7 w-7 rotate-12 rounded-md bg-pg-pink/[0.08]" />
        <div className="absolute left-[6%] top-1/3 flex -translate-y-1/2 flex-col gap-2.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-1.5 w-1.5 rounded-full bg-pg-border" />
          ))}
        </div>
        <div className="absolute right-[6%] top-1/3 flex -translate-y-1/2 flex-col gap-2.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-1.5 w-1.5 rounded-full bg-pg-border" />
          ))}
        </div>
      </div>

      <div className="relative z-[1] mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <h1
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-base-content"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            $AGBETS <span className="text-pg-violet">Token</span>
          </h1>
          <p className="mt-2 text-sm text-pg-muted max-w-md">
            The native token powering Agentic Bets prediction markets on Base.
          </p>
        </div>

        {/* CA display */}
        <div className="flex justify-center mb-8">
          <button
            onClick={handleCopy}
            className="group inline-flex items-center gap-2.5 rounded-xl border-2 border-pg-border bg-white/80 px-4 py-2.5 shadow-pop-soft transition-all hover:border-pg-violet/40 hover:shadow-md active:scale-[0.98]"
          >
            <span
              className="text-[11px] font-extrabold uppercase tracking-widest text-pg-violet"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              CA
            </span>
            <span className="h-4 w-px bg-pg-border" />
            <span className="font-mono text-sm font-bold text-base-content/70 hidden sm:inline">{AGBETS_TOKEN_CA}</span>
            <span className="font-mono text-sm font-bold text-base-content/70 sm:hidden">{short}</span>
            {copied ? (
              <CheckIcon className="h-4 w-4 text-pg-mint" />
            ) : (
              <ClipboardDocumentIcon className="h-4 w-4 text-pg-muted group-hover:text-pg-violet transition-colors" />
            )}
          </button>
        </div>

        {/* GeckoTerminal chart */}
        <div className="rounded-2xl border-2 border-pg-border bg-base-100 shadow-pop-soft overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b-2 border-pg-border bg-white/60">
            <span className="h-2.5 w-2.5 rounded-full bg-pg-pink/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-pg-amber/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-pg-mint/60" />
            <span
              className="ml-2 text-xs font-extrabold uppercase tracking-widest text-pg-muted"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Live Chart
            </span>
          </div>
          <iframe
            src={GECKO_EMBED_URL}
            title="GeckoTerminal AGBETS Chart"
            className="w-full"
            style={{ height: "500px" }}
            frameBorder="0"
            allowFullScreen
          />
        </div>

        {/* Powered by GeckoTerminal link (dofollow) */}
        <div className="mt-4 flex justify-center">
          <a
            href="https://www.geckoterminal.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-pg-muted hover:text-pg-violet transition-colors"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Powered by
            <span className="text-pg-violet">GeckoTerminal</span>
          </a>
        </div>

        {/* Geometric separator */}
        <div className="mt-8 flex items-center justify-center gap-3">
          <span className="h-px w-12 bg-pg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-pg-pink/40" />
          <span className="h-3 w-3 rotate-45 rounded-[3px] bg-pg-violet/30" />
          <span className="h-2.5 w-2.5 rounded-full bg-pg-mint/40" />
          <span className="h-px w-12 bg-pg-border" />
        </div>

        {/* Quick links */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href={`https://basescan.org/token/${AGBETS_TOKEN_CA}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border-2 border-pg-border bg-white/80 px-4 py-2 text-sm font-bold text-base-content/70 shadow-pop-soft transition-all hover:border-pg-violet/40 hover:text-pg-violet hover:shadow-md"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Basescan
          </a>
          <a
            href={`https://app.uniswap.org/swap?chain=base&outputCurrency=${AGBETS_TOKEN_CA}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border-2 border-pg-border bg-white/80 px-4 py-2 text-sm font-bold text-base-content/70 shadow-pop-soft transition-all hover:border-pg-violet/40 hover:text-pg-violet hover:shadow-md"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Trade on Uniswap
          </a>
          <a
            href="https://www.geckoterminal.com"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border-2 border-pg-border bg-white/80 px-4 py-2 text-sm font-bold text-base-content/70 shadow-pop-soft transition-all hover:border-pg-violet/40 hover:text-pg-violet hover:shadow-md"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            GeckoTerminal
          </a>
          <a
            href="https://dexscreener.com/base/0x9b2a0a54f851edd8241717a77a5cd5fad1f688770f2435cd77bfd46cc71b6b30"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border-2 border-pg-border bg-white/80 px-4 py-2 text-sm font-bold text-base-content/70 shadow-pop-soft transition-all hover:border-pg-violet/40 hover:text-pg-violet hover:shadow-md"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            DexScreener
          </a>
        </div>
      </div>
    </div>
  );
};

export default TokenPage;
