// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../contracts/BankrBetsOracle.sol";
import "../contracts/BankrBetsPrediction.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";

/**
 * @notice Deploy V2 contract pair for AGBETS market
 *
 * Usage:
 *   forge script script/DeployBankrBetsV2.s.sol \
 *     --rpc-url $BASE_RPC_URL \
 *     --broadcast \
 *     --verify \
 *     --verifier etherscan \
 *     --etherscan-api-key $BASESCAN_API_KEY
 */
contract DeployBankrBetsV2 is Script {
    address constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant WETH = 0x4200000000000000000000000000000000000006;

    // AGBETS token and pool params
    address constant AGBETS = 0x37d183FCf1DA460a64D21E754b3E6144C4e11BA3;
    address constant AGBETS_HOOK = 0xBDF938149ac6a781F94FAa0ed45E6A0e984c6544;
    uint24 constant DYNAMIC_FEE_FLAG = 0x800000;
    int24 constant TICK_SPACING = 200;

    uint256 constant MAX_ROUND_POOL = 10_000_000_000; // 10,000 USDC

    function run() external {
        require(block.chainid == 8453, "Deploy to Base mainnet only (chain 8453)");

        vm.startBroadcast();

        // 1. Deploy Oracle
        BankrBetsOracle oracle = new BankrBetsOracle(POOL_MANAGER);

        // 2. Deploy Prediction
        BankrBetsPrediction prediction = new BankrBetsPrediction(USDC, address(oracle));

        // 3. Wire oracle → prediction
        oracle.setPredictionContract(address(prediction));

        // 4. Prediction config
        prediction.setMaxRoundPool(MAX_ROUND_POOL);

        // 5. Allow the AGBETS hook (new configurable allowlist)
        oracle.allowHook(AGBETS_HOOK);

        // 6. Register AGBETS market via the prediction contract so the deployer
        //    is credited as the creator (and earns the 0.5% creator fee).
        // AGBETS (0x37d1) < WETH (0x4200) → AGBETS is currency0
        PoolKey memory agbetsKey = PoolKey({
            currency0: Currency.wrap(AGBETS),
            currency1: Currency.wrap(WETH),
            fee: DYNAMIC_FEE_FLAG,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(AGBETS_HOOK)
        });
        prediction.createMarket(AGBETS, agbetsKey);

        vm.stopBroadcast();

        console.log("=== BankrBets V2 (AGBETS) ===");
        console.log("BankrBetsOracleV2    :", address(oracle));
        console.log("BankrBetsPredictionV2:", address(prediction));
        console.log("AGBETS active        :", oracle.isTokenActive(AGBETS));
    }
}
