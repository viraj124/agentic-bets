"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hardhat } from "viem/chains";
import { Bars3Icon, ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { FaucetButton, RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-eth";

type HeaderMenuLink = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

export const menuLinks: HeaderMenuLink[] = [
  {
    label: "Markets",
    href: "/",
  },
  {
    label: "Leaderboard",
    href: "/leaderboard",
  },
  {
    label: "Portfolio",
    href: "/profile",
  },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href, icon }) => {
        const isActive = pathname === href;
        return (
          <li key={href}>
            <Link
              href={href}
              passHref
              className={`${
                isActive
                  ? "text-pg-violet font-bold bg-pg-violet/10 rounded-full no-underline"
                  : "text-pg-muted hover:text-base-content hover:bg-base-200/50 rounded-full"
              } px-4 py-1.5 text-sm transition-all duration-200 gap-2 grid grid-flow-col`}
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {icon}
              <span>{label}</span>
            </Link>
          </li>
        );
      })}
    </>
  );
};

export const Header = () => {
  const { targetNetwork } = useTargetNetwork();
  const isLocalNetwork = targetNetwork.id === hardhat.id;

  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  const [showDisclaimer, setShowDisclaimer] = useState(true);

  return (
    <div className="sticky top-0 z-20">
      {showDisclaimer && (
        <div className="flex items-center justify-center gap-2 bg-[#1a1028] border-b border-pg-violet/30 px-4 py-1.5 text-xs text-[#c4a8ff]">
          <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-semibold">Use at your own risk.</span> Contracts audited using open-source AI tools
            only.
          </span>
          <button
            onClick={() => setShowDisclaimer(false)}
            className="ml-1 p-0.5 rounded hover:bg-pg-violet/10 transition-colors"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="navbar bg-pg-cream/95 backdrop-blur-sm min-h-0 shrink-0 justify-between border-b-2 border-pg-border px-0 sm:px-2">
        <div className="navbar-start w-auto lg:w-1/2">
          <details className="dropdown" ref={burgerMenuRef}>
            <summary className="ml-1 btn btn-ghost lg:hidden hover:bg-transparent">
              <Bars3Icon className="h-1/2" />
            </summary>
            <ul
              className="menu menu-compact dropdown-content mt-3 p-2 bg-base-100 rounded-xl border-2 border-pg-slate shadow-pop w-52"
              onClick={() => {
                burgerMenuRef?.current?.removeAttribute("open");
              }}
            >
              <HeaderMenuLinks />
            </ul>
          </details>
          <Link href="/" passHref className="hidden lg:flex items-center ml-4 mr-8 shrink-0">
            <span
              className="font-extrabold text-base tracking-tight text-base-content"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              Agentic <span className="text-pg-violet">Bets</span>
            </span>
          </Link>
          <ul className="hidden lg:flex lg:flex-nowrap menu menu-horizontal px-1 gap-0">
            <HeaderMenuLinks />
          </ul>
        </div>
        <div className="navbar-end grow mr-4 gap-2">
          <RainbowKitCustomConnectButton />
          {isLocalNetwork && <FaucetButton />}
        </div>
      </div>
    </div>
  );
};
