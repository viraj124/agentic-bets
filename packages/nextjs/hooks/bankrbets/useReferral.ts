"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { isAddress } from "viem";
import { useAccount } from "wagmi";

const REFERRAL_STORAGE_KEY = "agenticbets_referrer";

// ── Capture ?ref= and register on wallet connect ─────────────────

export function useReferralCapture() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { address } = useAccount();
  const registeredRef = useRef(false);

  // Step 1: Capture ?ref= from URL → localStorage (first-referrer-wins)
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (!ref) return;

    if (isAddress(ref)) {
      const existing = localStorage.getItem(REFERRAL_STORAGE_KEY);
      if (!existing) {
        localStorage.setItem(REFERRAL_STORAGE_KEY, ref.toLowerCase());
      }
    }

    // Clean ref from URL without triggering navigation
    const params = new URLSearchParams(searchParams.toString());
    params.delete("ref");
    const query = params.toString();
    const cleanUrl = query ? `${pathname}?${query}` : pathname;
    router.replace(cleanUrl, { scroll: false });
  }, [searchParams, router, pathname]);

  // Step 2: When wallet connects + stored referrer exists → register
  useEffect(() => {
    if (!address || registeredRef.current) return;

    const referrer = localStorage.getItem(REFERRAL_STORAGE_KEY);
    if (!referrer || referrer.toLowerCase() === address.toLowerCase()) return;

    registeredRef.current = true;

    fetch("/api/referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referee: address, referrer }),
    }).catch(() => {
      // Silent — registration is best-effort
      registeredRef.current = false;
    });
  }, [address]);
}

// ── Referral link helpers ─────────────────────────────────────────

export function useReferralLink() {
  const { address } = useAccount();

  const referralLink = address
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/market?ref=${address}`
    : null;

  const copyReferralLink = useCallback(async () => {
    if (!referralLink) return false;
    try {
      await navigator.clipboard.writeText(referralLink);
      return true;
    } catch {
      return false;
    }
  }, [referralLink]);

  return { referralLink, copyReferralLink };
}

// ── Referral stats query ──────────────────────────────────────────

export interface ReferralStats {
  referrer: string;
  referralCount: number;
  referees: { address: string; createdAt: number }[];
  totalReferredVolume: number;
  totalReferredBets: number;
  estimatedReward: number;
}

export function useReferralStats() {
  const { address } = useAccount();

  return useQuery<ReferralStats>({
    queryKey: ["referral-stats", address?.toLowerCase()],
    queryFn: async () => {
      const res = await fetch(`/api/referral?referrer=${address}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!address,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
