import { createConfig } from "ponder";
import { http } from "viem";
import { abi } from "./abis/BankrBetsPrediction";

export default createConfig({
  networks: {
    base: {
      chainId: 8453,
      transport: http(process.env.PONDER_RPC_URL, { timeout: 60_000 }),
    },
  },
  contracts: {
    BankrBetsPrediction: {
      network: "base",
      abi,
      address: "0x1B342ec6fd99CFA929F4C020007D8b22eDE4c162",
      startBlock: 42823800,
    },
  },
});
