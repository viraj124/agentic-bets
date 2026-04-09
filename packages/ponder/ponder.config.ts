import { createConfig } from "ponder";
import { fallback, http } from "viem";
import { abi } from "./abis/BankrBetsPrediction";

export default createConfig({
  database: {
    connectionString: process.env.DATABASE_URL,
    schema: "bankr-bets-v3",
  },
  networks: {
    base: {
      chainId: 8453,
      transport: fallback([
        http(process.env.PONDER_RPC_URL, { timeout: 60_000 }),
        http(process.env.PONDER_RPC_URL_FALLBACK, { timeout: 60_000 }),
      ]),
      maxRequestsPerSecond: 10,
    },
  },
  contracts: {
    BankrBetsPrediction: {
      network: "base",
      abi,
      // V1 (original markets: CLAWD, MOLT, WCHAN) + V2 (AGBETS).
      // Both share the same ABI so a single handler set covers both.
      address: [
        "0xABADeb002247f2bd908Eeedb32918aEc304A0233",
        "0x2CD785Ba87e0841A8458141bc43d23a56a00557f",
      ],
      startBlock: 43830177,
    },
  },
});
