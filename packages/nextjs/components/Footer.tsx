import React, { useCallback, useState } from "react";
import Link from "next/link";
import { hardhat } from "viem/chains";
import { CheckIcon, ClipboardDocumentIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { AgenticBetsLogo } from "~~/components/assets/AgenticBetsLogo";
import { Faucet } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";

const AGBETS_TOKEN_CA = "0xBa5ED0000e1CA9136a695f0a848012A16008B032"; // TODO: replace with actual AGBETS CA

const footerLinks = [
  { label: "Markets", href: "/" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Portfolio", href: "/profile" },
];

const socialLinks = [
  {
    label: "GitHub",
    href: "https://github.com/viraj124/bankr-bets",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
      </svg>
    ),
  },
  {
    label: "Telegram",
    href: "https://t.me/Viraz04",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0Zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635Z" />
      </svg>
    ),
  },
  {
    label: "Twitter",
    href: "https://twitter.com/Viraz04",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117Z" />
      </svg>
    ),
  },
];

/* Base logo — blue circle with white "B" shape */
const BaseLogo = () => (
  <svg className="h-4 w-4" viewBox="0 0 111 111" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="55.5" cy="55.5" r="55.5" fill="#0052FF" />
    <path
      d="M55.39 93.72c21.14 0 38.28-17.14 38.28-38.28S76.53 17.16 55.39 17.16c-19.89 0-36.2 15.2-38.05 34.62h50.36v7.31H17.34c1.85 19.42 18.16 34.63 38.05 34.63Z"
      fill="white"
    />
  </svg>
);

const TokenCA = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(AGBETS_TOKEN_CA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const short = `${AGBETS_TOKEN_CA.slice(0, 10)}...${AGBETS_TOKEN_CA.slice(-4)}`;

  return (
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
  );
};

export const Footer = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  return (
    <div className={`min-h-0 pt-8 ${isLocalNetwork ? "mb-11 lg:mb-0" : ""}`}>
      {/* Local-network dev tools */}
      {isLocalNetwork && (
        <div className="fixed flex justify-between items-center w-full z-10 p-4 bottom-0 left-0 pointer-events-none">
          <div className="flex flex-col md:flex-row gap-2 pointer-events-auto">
            <Faucet />
            <Link
              href="/blockexplorer"
              passHref
              className="btn btn-sm font-normal gap-1 bg-base-100 border-base-300/60 text-base-content/60"
            >
              <MagnifyingGlassIcon className="h-4 w-4" />
              <span>Explorer</span>
            </Link>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="relative w-full overflow-hidden border-t-2 border-pg-border bg-base-100">
        {/* Decorative background shapes */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {/* Top-left cluster */}
          <div className="absolute -left-4 top-6 h-28 w-28 rounded-full bg-pg-pink/[0.06]" />
          <div className="absolute left-16 top-2 h-5 w-5 rotate-45 rounded-sm bg-pg-violet/[0.10]" />
          <div className="absolute left-8 top-32 h-3 w-3 rounded-full bg-pg-mint/[0.15]" />

          {/* Top-right cluster */}
          <div className="absolute -right-6 top-10 h-32 w-32 rounded-full bg-pg-violet/[0.05]" />
          <div className="absolute right-20 top-4 h-4 w-4 rounded-full bg-pg-amber/[0.12]" />
          <div className="absolute right-12 top-28 h-6 w-6 rotate-12 rounded-md bg-pg-pink/[0.08]" />

          {/* Mid-left */}
          <div className="absolute -left-10 bottom-20 h-20 w-20 rounded-full bg-pg-amber/[0.06]" />
          <div className="absolute left-24 bottom-16 h-3.5 w-3.5 rotate-45 rounded-sm bg-pg-mint/[0.10]" />

          {/* Mid-right */}
          <div className="absolute -right-8 bottom-24 h-24 w-24 rounded-full bg-pg-mint/[0.05]" />
          <div className="absolute right-28 bottom-12 h-4 w-4 rounded-full bg-pg-violet/[0.08]" />

          {/* Dotted accent line — left side */}
          <div className="absolute left-[8%] top-1/2 flex -translate-y-1/2 flex-col gap-2.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-1.5 w-1.5 rounded-full bg-pg-border" />
            ))}
          </div>

          {/* Dotted accent line — right side */}
          <div className="absolute right-[8%] top-1/2 flex -translate-y-1/2 flex-col gap-2.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-1.5 w-1.5 rounded-full bg-pg-border" />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="relative z-[1] mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
          {/* Brand centered */}
          <div className="flex flex-col items-center text-center">
            <div className="rounded-2xl border-2 border-pg-border bg-white/80 p-2.5 shadow-pop-soft">
              <AgenticBetsLogo className="h-11 w-11" />
            </div>
            <span
              className="mt-4 text-xl font-extrabold tracking-tight text-base-content"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Agentic <span className="text-pg-violet">Bets</span>
            </span>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-pg-muted">
              Prediction markets for Base tokens. Pick a side, place your bet, and win.
            </p>
            <div className="mt-5">
              <TokenCA />
            </div>
          </div>

          {/* Geometric separator */}
          <div className="mt-8 flex items-center justify-center gap-3">
            <span className="h-px w-12 bg-pg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-pg-pink/40" />
            <span className="h-3 w-3 rotate-45 rounded-[3px] bg-pg-violet/30" />
            <span className="h-2.5 w-2.5 rounded-full bg-pg-mint/40" />
            <span className="h-px w-12 bg-pg-border" />
          </div>

          {/* Links + Social centered */}
          <div className="mt-8 flex flex-col items-center gap-8 sm:flex-row sm:justify-center sm:gap-24">
            {/* Navigate */}
            <div className="text-center">
              <p
                className="text-[11px] font-extrabold uppercase tracking-widest text-pg-muted mb-4"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Navigate
              </p>
              <ul className="flex flex-col gap-2.5">
                {footerLinks.map(({ label, href }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-sm font-bold text-base-content/70 hover:text-pg-violet transition-colors"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Vertical divider on desktop */}
            <div className="hidden sm:block h-20 w-px bg-pg-border/80" />

            {/* Social */}
            <div className="text-center">
              <p
                className="text-[11px] font-extrabold uppercase tracking-widest text-pg-muted mb-4"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                Social
              </p>
              <ul className="flex flex-col gap-2.5">
                {socialLinks.map(({ label, href, icon }) => (
                  <li key={href}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 text-sm font-bold text-base-content/70 hover:text-pg-violet transition-colors"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      <span className="text-pg-violet/60">{icon}</span>
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom row */}
          <div className="mt-10 pt-6 border-t-2 border-pg-border/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-pg-muted">
            <span>
              Built by{" "}
              <a
                href="https://twitter.com/Viraz04"
                target="_blank"
                rel="noreferrer"
                className="font-bold text-pg-violet hover:text-pg-violet/80 transition-colors"
              >
                viraz.eth
              </a>
            </span>
            <span className="inline-flex items-center gap-1.5">
              Built on <BaseLogo /> <span className="font-bold text-base-content/60">Base</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
