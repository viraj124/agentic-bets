import React from "react";
import Link from "next/link";
import { hardhat } from "viem/chains";
import {
  ArrowTopRightOnSquareIcon,
  CodeBracketIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { BankrBetsLogo } from "~~/components/assets/BankrBetsLogo";
import { Faucet } from "~~/components/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";

const primaryLinks = [
  {
    label: "GitHub",
    href: "https://github.com/viraj124/bankr-bets",
    icon: CodeBracketIcon,
  },
];

const socialLinks = [
  {
    label: "Telegram",
    href: "https://t.me/Viraz04",
    icon: PaperAirplaneIcon,
  },
  {
    label: "Twitter",
    href: "http://twitter.com/Viraz04",
    icon: ArrowTopRightOnSquareIcon,
  },
] as const;

export const Footer = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  return (
    <div className={`min-h-0 pt-4 ${isLocalNetwork ? "mb-11 lg:mb-0" : ""}`}>
      <div>
        <div className="fixed flex justify-between items-center w-full z-10 p-4 bottom-0 left-0 pointer-events-none">
          <div className="flex flex-col md:flex-row gap-2 pointer-events-auto">
            {isLocalNetwork && (
              <>
                <Faucet />
                <Link
                  href="/blockexplorer"
                  passHref
                  className="btn btn-sm font-normal gap-1 bg-base-100 border-base-300/60 text-base-content/60"
                >
                  <MagnifyingGlassIcon className="h-4 w-4" />
                  <span>Explorer</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="w-full pt-6">
        <div className="w-full overflow-hidden rounded-[28px] border-2 border-pg-border/80 bg-[linear-gradient(90deg,rgba(244,114,182,0.10)_0%,rgba(139,92,246,0.08)_22%,rgba(255,253,245,0.94)_48%,rgba(255,253,245,0.98)_100%)] shadow-[0_18px_40px_rgba(30,41,59,0.05)]">
          <div className="px-5 py-6 sm:px-7 sm:py-8">
            <div className="grid gap-10 lg:grid-cols-[1.55fr_0.72fr_0.88fr] lg:gap-8">
              <div className="pr-0 lg:pr-8">
                <div className="flex items-center gap-4">
                  <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[28px] border-2 border-pg-border bg-white/75 shadow-[0_10px_24px_rgba(139,92,246,0.08)]">
                    <BankrBetsLogo className="h-12 w-12" />
                  </div>
                  <h3
                    className="mb-0 text-[34px] sm:text-[42px] font-extrabold leading-none text-base-content"
                    style={{ fontFamily: "var(--font-heading)" }}
                  >
                    Bankr<span className="text-pg-violet">Bets</span>
                  </h3>
                </div>

                <p className="mt-4 max-w-md text-[15px] leading-[1.65] text-pg-muted">
                  Prediction markets for Bankr ecosystem tokens on Base.
                </p>

                <div className="mt-10 flex items-center gap-3 text-[13px] text-pg-muted">
                  <span className="font-medium">Contract:</span>
                  <span className="h-px w-24 bg-pg-border/90" />
                </div>
              </div>

              <div className="lg:justify-self-center lg:min-w-[170px]">
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.28em] text-pg-muted"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Links
                </p>
                <div className="mt-5 flex flex-col gap-4">
                  {primaryLinks.map(({ label, href, icon: Icon }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2.5 text-[12px] font-bold uppercase tracking-[0.24em] text-base-content transition-colors hover:text-pg-violet"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      <Icon className="h-[15px] w-[15px] shrink-0 text-pg-violet/70" />
                      <span>{label}</span>
                    </a>
                  ))}
                </div>
              </div>

              <div className="lg:justify-self-end lg:min-w-[170px] lg:text-left">
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.28em] text-pg-muted"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  Social
                </p>
                <div className="mt-5 flex flex-col gap-4">
                  {socialLinks.map(({ label, href, icon: Icon }) => (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2.5 text-[12px] font-bold uppercase tracking-[0.24em] text-base-content transition-colors hover:text-pg-violet"
                      style={{ fontFamily: "var(--font-heading)" }}
                    >
                      <Icon className="h-[15px] w-[15px] shrink-0 text-pg-violet/70" />
                      <span>{label}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 grid gap-4 border-t-2 border-pg-border/60 pt-6 text-[14px] text-pg-muted lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              <div>
                <a
                  href="http://twitter.com/Viraz04"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-semibold text-base-content transition-colors hover:text-pg-violet"
                >
                  <span className="text-pg-muted">Built by</span>
                  <span className="text-pg-violet">viraz.eth</span>
                </a>
              </div>
              <div className="flex items-center justify-center">
                <div className="inline-flex items-center gap-2.5 rounded-full border border-pg-border/80 bg-pg-cream/70 px-3.5 py-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-pg-pink" />
                  <span className="h-3 w-3 rotate-45 rounded-[4px] bg-pg-violet" />
                  <span className="h-0 w-0 border-l-[6px] border-r-[6px] border-b-[11px] border-l-transparent border-r-transparent border-b-pg-amber" />
                </div>
              </div>
              <div className="text-left lg:text-right">
                <span>© 2026 Bankr Bets</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
