import { createConfig } from "ponder";
import { fallback, http } from "viem";
import { abi } from "./abis/BankrBetsPrediction";

export default createConfig({
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
      address: "0x8e9eBff2D977C69501a66961c919Cb7AA44494ce",
      startBlock: 43731841,
    },
  },
});
