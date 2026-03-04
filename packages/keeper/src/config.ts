import { type Hex, type Address, isHex, isAddress } from "viem";

export type Config = {
  keeperPrivateKey: Hex;
  rpcUrl: string;
  sweepRecipient: Address;
  pollIntervalMs: number;
  port: number;
  sweepThresholdUsdc: bigint;
  sweepIntervalTicks: number;
  minEthBalance: bigint;
};

// Hardcoded constants
export const PREDICTION_ADDRESS: Address = "0x1B342ec6fd99CFA929F4C020007D8b22eDE4c162";
export const ORACLE_ADDRESS: Address = "0x5bd625AaEaFA824031B57Cd7CA905D389ddF9257";
export const USDC_ADDRESS: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const CHAIN_ID = 8453;
export const GAS_LIMIT = 300_000n;
export const TX_TIMEOUT_MS = 30_000;
export const MARKET_REFRESH_TICKS = 6; // refresh active tokens every ~60s

export function loadConfig(): Config {
  const keeperPrivateKey = requireEnv("KEEPER_PRIVATE_KEY");
  if (!isHex(keeperPrivateKey)) {
    throw new Error("KEEPER_PRIVATE_KEY must be a hex string starting with 0x");
  }

  const rpcUrl = requireEnv("RPC_URL");

  const sweepRecipient = requireEnv("SWEEP_RECIPIENT");
  if (!isAddress(sweepRecipient)) {
    throw new Error("SWEEP_RECIPIENT must be a valid address");
  }

  const pollIntervalMs = intEnv("POLL_INTERVAL_MS", 10_000);
  const port = intEnv("PORT", 3000);
  const sweepThresholdUsdc = BigInt(intEnv("SWEEP_THRESHOLD_USDC", 10)) * 1_000_000n; // 6 decimals
  const sweepIntervalTicks = intEnv("SWEEP_INTERVAL_TICKS", 60);
  const minEthBalance = BigInt(Math.floor(floatEnv("MIN_ETH_BALANCE", 0.005) * 1e18));

  return {
    keeperPrivateKey: keeperPrivateKey as Hex,
    rpcUrl,
    sweepRecipient: sweepRecipient as Address,
    pollIntervalMs,
    port,
    sweepThresholdUsdc,
    sweepIntervalTicks,
    minEthBalance,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function intEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

function floatEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = parseFloat(raw);
  if (isNaN(parsed)) throw new Error(`${name} must be a number`);
  return parsed;
}
