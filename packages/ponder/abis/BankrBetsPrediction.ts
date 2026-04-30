export const abi = [
  {
    type: "event",
    name: "BetBull",
    inputs: [
      { name: "sender", type: "address", indexed: true, internalType: "address" },
      { name: "token", type: "address", indexed: true, internalType: "address" },
      { name: "epoch", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "BetBear",
    inputs: [
      { name: "sender", type: "address", indexed: true, internalType: "address" },
      { name: "token", type: "address", indexed: true, internalType: "address" },
      { name: "epoch", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Claim",
    inputs: [
      { name: "sender", type: "address", indexed: true, internalType: "address" },
      { name: "token", type: "address", indexed: true, internalType: "address" },
      { name: "epoch", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RoundEnded",
    inputs: [
      { name: "token", type: "address", indexed: true, internalType: "address" },
      { name: "epoch", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "closePrice", type: "int256", indexed: false, internalType: "int256" },
      { name: "settler", type: "address", indexed: true, internalType: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RoundCancelled",
    inputs: [
      { name: "token", type: "address", indexed: true, internalType: "address" },
      { name: "epoch", type: "uint256", indexed: true, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RoundRefunded",
    inputs: [
      { name: "token", type: "address", indexed: true, internalType: "address" },
      { name: "epoch", type: "uint256", indexed: true, internalType: "uint256" },
    ],
    anonymous: false,
  },
] as const;
