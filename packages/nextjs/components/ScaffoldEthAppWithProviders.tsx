"use client";

import { useEffect } from "react";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import { DehydratedState, Query, QueryClient, QueryClientProvider, dehydrate, hydrate } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { Toaster } from "react-hot-toast";
import { WagmiProvider } from "wagmi";
import { Footer } from "~~/components/Footer";
import { Header } from "~~/components/Header";
import { BlockieAvatar } from "~~/components/scaffold-eth";
import scaffoldConfig from "~~/scaffold.config";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const ScaffoldEthApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <div className={`flex flex-col min-h-screen `}>
        <Header />
        <main className="relative flex flex-col flex-1">{children}</main>
        <Footer />
      </div>
      <Toaster />
    </>
  );
};

const QUERY_CACHE_STORAGE_KEY = "bankr-bets-rq-cache-v1";
const QUERY_CACHE_MAX_AGE_MS = 30 * 60_000;
const QUERY_CACHE_PERSIST_DEBOUNCE_MS = 750;
const PERSISTED_QUERY_ROOT_KEYS = new Set([
  "bankr-enriched-tokens",
  "ohlcv",
  "gecko-pool",
  "gecko-pools-multi",
  "oracle-active-markets-paged",
]);

function shouldPersistQuery(query: Query): boolean {
  const rootKey = query.queryKey[0];
  return typeof rootKey === "string" && PERSISTED_QUERY_ROOT_KEYS.has(rootKey) && query.state.status === "success";
}

function readPersistedQueryState(): DehydratedState | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const raw = window.sessionStorage.getItem(QUERY_CACHE_STORAGE_KEY);
    if (!raw) return undefined;

    const parsed = JSON.parse(raw) as { timestamp?: number; state?: DehydratedState };
    if (!parsed.timestamp || !parsed.state) return undefined;

    if (Date.now() - parsed.timestamp > QUERY_CACHE_MAX_AGE_MS) {
      window.sessionStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
      return undefined;
    }

    return parsed.state;
  } catch {
    return undefined;
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      gcTime: QUERY_CACHE_MAX_AGE_MS,
    },
  },
});

export const ScaffoldEthAppWithProviders = ({ children }: { children: React.ReactNode }) => {
  const { targetNetworks } = scaffoldConfig;

  useEffect(() => {
    if (typeof window === "undefined") return;

    let persistTimer: ReturnType<typeof setTimeout> | undefined;
    let cacheRestored = false;

    const persistQueryCache = () => {
      try {
        const state = dehydrate(queryClient, { shouldDehydrateQuery: shouldPersistQuery });
        window.sessionStorage.setItem(
          QUERY_CACHE_STORAGE_KEY,
          JSON.stringify({
            timestamp: Date.now(),
            state,
          }),
        );
      } catch {
        // Ignore persistence errors; runtime cache still works.
      }
    };

    const restoredState = readPersistedQueryState();
    if (restoredState) {
      hydrate(queryClient, restoredState);
    }
    cacheRestored = true;

    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (!cacheRestored) return;
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        persistQueryCache();
        persistTimer = undefined;
      }, QUERY_CACHE_PERSIST_DEBOUNCE_MS);
    });

    const handlePageHide = () => {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = undefined;
      }
      persistQueryCache();
    };

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      if (persistTimer) clearTimeout(persistTimer);
      unsubscribe();
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider avatar={BlockieAvatar} initialChain={targetNetworks[0]} theme={lightTheme()}>
          <ProgressBar height="3px" color="#2299dd" options={{ showSpinner: false }} />
          <ScaffoldEthApp>{children}</ScaffoldEthApp>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
