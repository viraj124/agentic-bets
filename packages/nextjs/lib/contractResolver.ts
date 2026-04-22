/**
 * Multi-contract resolver for BankrBets.
 *
 * V1 contracts serve legacy markets.
 * V2 contracts serve AGBETS plus Bankr tokens whose verified pool key uses the
 * V2-only hook 0xBDF938149ac6a781F94FAa0ed45E6A0e984c6544.
 *
 * After deploying V2, fill in the real addresses below.
 */

// Tokens that must route to V2.
export const AGBETS_TOKEN = "0x37d183FCf1DA460a64D21E754b3E6144C4e11BA3";
export const V2_TOKENS = new Set(
  [
    AGBETS_TOKEN,
    "0x90865e4aef5c9c0bcdfe35012db3efd0dd40fba3", // FRANKLIN
    "0x01d1d512cb790e47a3e2c569e95ef667776f2ba3", // M44B
    "0x6160db9066478825fffc5721f7ae61dd227e5ba3", // KAIO
    "0xa8af235339b8832ba609538e5441067490536ba3", // CUM
    "0x2159b624913929b51091e68273612a48c67e7ba3", // FLORK
    "0x38d9798a8448a3f6088214e302f68689498dbba3", // flork
    "0x128370638c078c55ae677478ed3e444518453ba3", // ONCHAT
    "0xfb7c5156ea26727dd32a7c50ce0d20a914b3cba3", // CUP
    "0x764222f3b01d473023f51ba1d7ed998d010e2ba3", // test6
    "0xf514eaeb318024c825132d548c4a78aec9f18ba3", // ACE
    "0x0f758abf9b242daa6b2b5e976d6e00c5aece9b07", // 🟦 (vanilla V4, native ETH)
  ].map(token => token.toLowerCase()),
);

// V2 contract addresses (AGBETS market)
export const V2_ORACLE_ADDRESS = "0xd45360693a3769f0E80EA901F4698dCC9FcC917C" as `0x${string}`;
export const V2_PREDICTION_ADDRESS = "0x2CD785Ba87e0841A8458141bc43d23a56a00557f" as `0x${string}`;

/**
 * Returns the scaffold-eth contract name to use for a given token.
 * AGBETS + hook-routed tokens → V2 contracts, everything else → V1.
 */
export function getPredictionContractName(tokenAddress: string): "BankrBetsPrediction" | "BankrBetsPredictionV2" {
  if (V2_TOKENS.has(tokenAddress.toLowerCase())) return "BankrBetsPredictionV2";
  return "BankrBetsPrediction";
}

export function getOracleContractName(tokenAddress: string): "BankrBetsOracle" | "BankrBetsOracleV2" {
  if (V2_TOKENS.has(tokenAddress.toLowerCase())) return "BankrBetsOracleV2";
  return "BankrBetsOracle";
}

export function isV2Token(tokenAddress: string): boolean {
  return V2_TOKENS.has(tokenAddress.toLowerCase());
}
