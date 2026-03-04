import { createServer, type Server } from "node:http";
import { logger } from "./logger.js";

export type HealthState = {
  startedAt: number;
  lastPollAt: number;
  activeMarkets: number;
  totalLocks: number;
  totalCloses: number;
  totalSwept: bigint;
  walletAddress: string;
  consecutiveErrors: number;
  ethBalance: bigint;
  usdcBalance: bigint;
  lowBalance: boolean;
};

export function createHealthState(walletAddress: string): HealthState {
  return {
    startedAt: Date.now(),
    lastPollAt: 0,
    activeMarkets: 0,
    totalLocks: 0,
    totalCloses: 0,
    totalSwept: 0n,
    walletAddress,
    consecutiveErrors: 0,
    ethBalance: 0n,
    usdcBalance: 0n,
    lowBalance: false,
  };
}

export function startHealthServer(port: number, state: HealthState): Server {
  const server = createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      const body = JSON.stringify({
        healthy: state.consecutiveErrors < 10,
        uptime: Math.floor((Date.now() - state.startedAt) / 1000),
        lastPollAt: state.lastPollAt ? new Date(state.lastPollAt).toISOString() : null,
        activeMarkets: state.activeMarkets,
        totalLocks: state.totalLocks,
        totalCloses: state.totalCloses,
        totalSwept: formatUsdc(state.totalSwept),
        walletAddress: state.walletAddress,
        consecutiveErrors: state.consecutiveErrors,
        ethBalance: formatEth(state.ethBalance),
        usdcBalance: formatUsdc(state.usdcBalance),
        lowBalance: state.lowBalance,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(body);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(port, () => {
    logger.info("Health server started", { port });
  });

  return server;
}

function formatEth(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  return `${whole}.${frac.toString().padStart(18, "0").slice(0, 6)}`;
}

function formatUsdc(raw: bigint): string {
  const whole = raw / 1_000_000n;
  const frac = raw % 1_000_000n;
  return `${whole}.${frac.toString().padStart(6, "0")}`;
}
