import { type Hex } from "viem";

export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Hex;
export const USDC_DECIMALS = 6;

export const AGBETS_TOKEN = "0x37d183FCf1DA460a64D21E754b3E6144C4e11BA3" as Hex;

// V1 — existing markets (CLAWD, MOLT, WCHAN)
export const PREDICTION_V1 = "0xABADeb002247f2bd908Eeedb32918aEc304A0233" as Hex;
// V2 — AGBETS market
export const PREDICTION_V2 = "0x2CD785Ba87e0841A8458141bc43d23a56a00557f" as Hex;

export function getPredictionAddress(tokenAddress: string): Hex {
  return tokenAddress.toLowerCase() === AGBETS_TOKEN.toLowerCase()
    ? PREDICTION_V2
    : PREDICTION_V1;
}

export const predictionAbi = [
  {
    type: "function",
    name: "bet",
    inputs: [
      { name: "_token", type: "address" },
      { name: "_amount", type: "uint256" },
      { name: "_position", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claim",
    inputs: [
      { name: "_token", type: "address" },
      { name: "_epochs", type: "uint256[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimable",
    inputs: [
      { name: "_token", type: "address" },
      { name: "_epoch", type: "uint256" },
      { name: "_user", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCurrentEpoch",
    inputs: [{ name: "_token", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRound",
    inputs: [
      { name: "_token", type: "address" },
      { name: "_epoch", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "epoch", type: "uint256" },
          { name: "startTimestamp", type: "uint256" },
          { name: "lockTimestamp", type: "uint256" },
          { name: "closeTimestamp", type: "uint256" },
          { name: "lockPrice", type: "uint256" },
          { name: "closePrice", type: "uint256" },
          { name: "totalAmount", type: "uint256" },
          { name: "bullAmount", type: "uint256" },
          { name: "bearAmount", type: "uint256" },
          { name: "rewardBaseCalAmount", type: "uint256" },
          { name: "rewardAmount", type: "uint256" },
          { name: "locked", type: "bool" },
          { name: "oracleCalled", type: "bool" },
          { name: "cancelled", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getUserBet",
    inputs: [
      { name: "_token", type: "address" },
      { name: "_epoch", type: "uint256" },
      { name: "_user", type: "address" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "position", type: "uint8" },
          { name: "amount", type: "uint256" },
          { name: "claimed", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
