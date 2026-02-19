// Base quote token for Bankr/Clanker markets.
export const WETH_BASE = "0x4200000000000000000000000000000000000006" as const;

// Uniswap v4 shared parameters used by supported Bankr/Clanker launch flows.
export const CLANKER_DYNAMIC_FEE_FLAG = 0x800000 as const;
export const BANKR_SCHEDULED_MULTICURVE_FEE = 12000 as const;
export const REQUIRED_TICK_SPACING = 200 as const;

export const SUPPORTED_BANKR_V4_HOOKS = {
  CLANKER_DYNAMIC_FEE_V2: "0xd60D6B218116cFd801E28F78d011a203D2b068Cc",
  CLANKER_STATIC_FEE_V2: "0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC",
  CLANKER_DYNAMIC_FEE: "0x34a45c6B61876d739400Bd71228CbcbD4F53E8cC",
  CLANKER_STATIC_FEE: "0xDd5EeaFf7BD481AD55Db083062b13a3cdf0A68CC",
  BANKR_SCHEDULED_MULTICURVE: "0x3e342a06f9592459d75721d6956b570f02ef2dc0",
  BANKR_DECAY_MULTICURVE: "0xbb7784a4d481184283ed89619a3e3ed143e1adc0",
} as const;

export const SUPPORTED_BANKR_V4_HOOK_CONFIGS = [
  {
    name: "Clanker:DynamicFeeV2",
    address: SUPPORTED_BANKR_V4_HOOKS.CLANKER_DYNAMIC_FEE_V2,
    fee: CLANKER_DYNAMIC_FEE_FLAG,
  },
  {
    name: "Clanker:StaticFeeV2",
    address: SUPPORTED_BANKR_V4_HOOKS.CLANKER_STATIC_FEE_V2,
    fee: CLANKER_DYNAMIC_FEE_FLAG,
  },
  { name: "Clanker:DynamicFee", address: SUPPORTED_BANKR_V4_HOOKS.CLANKER_DYNAMIC_FEE, fee: CLANKER_DYNAMIC_FEE_FLAG },
  { name: "Clanker:StaticFee", address: SUPPORTED_BANKR_V4_HOOKS.CLANKER_STATIC_FEE, fee: CLANKER_DYNAMIC_FEE_FLAG },
  {
    name: "Bankr:ScheduledMulticurve",
    address: SUPPORTED_BANKR_V4_HOOKS.BANKR_SCHEDULED_MULTICURVE,
    fee: BANKR_SCHEDULED_MULTICURVE_FEE,
  },
  {
    name: "Bankr:DecayMulticurve",
    address: SUPPORTED_BANKR_V4_HOOKS.BANKR_DECAY_MULTICURVE,
    fee: CLANKER_DYNAMIC_FEE_FLAG,
  },
] as const;

// Default fallback used when API pool metadata is unavailable for a token.
export const DEFAULT_FALLBACK_HOOK = SUPPORTED_BANKR_V4_HOOKS.CLANKER_STATIC_FEE_V2;
