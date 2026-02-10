"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { hardhat } from "viem/chains";
import { Bars3Icon } from "@heroicons/react/24/outline";
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
                  ? "text-pg-violet font-bold bg-pg-violet/10 rounded-full"
                  : "text-pg-muted hover:text-base-content"
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

  return (
    <div className="sticky top-0 navbar bg-pg-cream/95 backdrop-blur-sm min-h-0 shrink-0 justify-between z-20 border-b-2 border-pg-border px-0 sm:px-2">
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
        <Link href="/" passHref className="hidden lg:flex items-center gap-2.5 ml-4 mr-8 shrink-0 group">
          <div
            className="w-8 h-8 rounded-xl bg-pg-violet border-2 border-pg-slate flex items-center justify-center shadow-pop-active group-hover:shadow-pop transition-all duration-200"
            style={{ transitionTimingFunction: "var(--ease-bounce)" }}
          >
            <span className="text-white text-sm font-extrabold" style={{ fontFamily: "var(--font-heading)" }}>
              B
            </span>
          </div>
          <span
            className="font-extrabold text-base tracking-tight text-base-content"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Bankr<span className="text-pg-violet">Bets</span>
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
  );
};
