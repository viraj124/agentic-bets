import * as chains from "viem/chains";

export type BaseConfig = {
  targetNetworks: readonly chains.Chain[];
  pollingInterval: number;
  alchemyApiKey: string;
  rpcOverrides?: Record<number, string>;
  walletConnectProjectId: string;
  onlyLocalBurnerWallet: boolean;
};

export type ScaffoldConfig = BaseConfig;

export const DEFAULT_ALCHEMY_API_KEY = "cR4WnXePioePZ5fFrnSiR";

const scaffoldConfig = {
  targetNetworks: [chains.base],
  pollingInterval: 3000,
  // Alchemy key is kept as the default — the actual key lives server-only in ALCHEMY_API_KEY.
  // Client-side wagmi uses the RPC proxy below, so no key is ever in the browser bundle.
  alchemyApiKey: DEFAULT_ALCHEMY_API_KEY,
  // RPC proxy — the server injects ALCHEMY_API_KEY before forwarding to Alchemy.
  rpcOverrides: {
    [chains.base.id]: "/api/rpc/base-mainnet",
  },
  // WalletConnect project ID — get your own at https://cloud.walletconnect.com
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || "3a8170812b534d0ff9d794f19a901d64",
  onlyLocalBurnerWallet: false,
} as const satisfies ScaffoldConfig;

export default scaffoldConfig;
