import deployedContractsData from "./deployedContracts";
import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

/**
 * V2 contracts for the AGBETS market.
 *
 * They use the same Solidity code (and therefore the same ABI) as V1,
 * but are deployed at separate addresses so AGBETS can have its own
 * Oracle + Prediction pair while existing markets keep their volume history.
 *
 * UPDATE the addresses below once DeployBankrBetsV2.s.sol has been broadcast.
 */
const externalContracts = {
  8453: {
    BankrBetsOracleV2: {
      address: "0xd45360693a3769f0E80EA901F4698dCC9FcC917C",
      abi: deployedContractsData[8453].BankrBetsOracle.abi,
    },
    BankrBetsPredictionV2: {
      address: "0x2CD785Ba87e0841A8458141bc43d23a56a00557f",
      abi: deployedContractsData[8453].BankrBetsPrediction.abi,
    },
  },
} as const;

export default externalContracts satisfies GenericContractsDeclaration;
