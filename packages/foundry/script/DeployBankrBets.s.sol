// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../contracts/BankrBetsOracle.sol";
import "../contracts/BankrBetsPrediction.sol";

/**
 * @notice Deploy script for BankrBets contracts
 * @dev Usage:
 *      forge script script/DeployBankrBets.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify
 *      forge script script/DeployBankrBets.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --verify
 */
contract DeployBankrBets is Script {
    // Base mainnet
    address constant BASE_POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // Base Sepolia
    address constant BASE_SEPOLIA_POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        address poolManagerAddress;
        address usdcAddress;

        if (block.chainid == 8453) {
            poolManagerAddress = BASE_POOL_MANAGER;
            usdcAddress = BASE_USDC;
        } else if (block.chainid == 84_532) {
            poolManagerAddress = BASE_SEPOLIA_POOL_MANAGER;
            usdcAddress = BASE_SEPOLIA_USDC;
        } else {
            revert("Unsupported chain: deploy to Base mainnet (8453) or Base Sepolia (84532)");
        }

        vm.startBroadcast();

        // Deploy Oracle (permissionless registry + V4 price oracle)
        BankrBetsOracle oracle = new BankrBetsOracle(poolManagerAddress);

        // Deploy Prediction contract
        BankrBetsPrediction prediction = new BankrBetsPrediction(usdcAddress, address(oracle));

        // Link oracle → prediction (required for addTokenFor + active round checks)
        oracle.setPredictionContract(address(prediction));

        vm.stopBroadcast();

        console.log("BankrBetsOracle   :", address(oracle));
        console.log("BankrBetsPrediction:", address(prediction));
    }
}
