/**
 * Multi-contract resolver for BankrBets.
 *
 * V1 contracts serve existing markets (CLAWD, MOLT, WCHAN).
 * V2 contracts serve AGBETS. Both are shown on the UI merged together.
 *
 * After deploying V2, fill in the real addresses below.
 */

// AGBETS token address (the only token on V2 for now)
export const AGBETS_TOKEN = "0x37d183FCf1DA460a64D21E754b3E6144C4e11BA3";

// V2 contract addresses (AGBETS market)
export const V2_ORACLE_ADDRESS = "0xd45360693a3769f0E80EA901F4698dCC9FcC917C" as `0x${string}`;
export const V2_PREDICTION_ADDRESS = "0x2CD785Ba87e0841A8458141bc43d23a56a00557f" as `0x${string}`;

/**
 * Returns the scaffold-eth contract name to use for a given token.
 * AGBETS → V2 contracts, everything else → V1.
 */
export function getPredictionContractName(tokenAddress: string): "BankrBetsPrediction" | "BankrBetsPredictionV2" {
  if (tokenAddress.toLowerCase() === AGBETS_TOKEN.toLowerCase()) return "BankrBetsPredictionV2";
  return "BankrBetsPrediction";
}

export function getOracleContractName(tokenAddress: string): "BankrBetsOracle" | "BankrBetsOracleV2" {
  if (tokenAddress.toLowerCase() === AGBETS_TOKEN.toLowerCase()) return "BankrBetsOracleV2";
  return "BankrBetsOracle";
}

export function isV2Token(tokenAddress: string): boolean {
  return tokenAddress.toLowerCase() === AGBETS_TOKEN.toLowerCase();
}
