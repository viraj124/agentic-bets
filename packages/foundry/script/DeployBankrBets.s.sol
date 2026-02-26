// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../contracts/BankrBetsOracle.sol";
import "../contracts/BankrBetsPrediction.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";

/**
 * @notice Deploy script for BankrBets contracts (Base mainnet only)
 *
 * Usage:
 *   forge script script/DeployBankrBets.s.sol \
 *     --rpc-url $BASE_RPC_URL \
 *     --broadcast \
 *     --verify \
 *     --verifier etherscan \
 *     --etherscan-api-key $BASESCAN_API_KEY
 *
 * Required env: PRIVATE_KEY (deployer, becomes owner of both contracts)
 */
contract DeployBankrBets is Script {
    // -------------------------------------------------------------------------
    // Base mainnet — Uniswap V4
    // PoolManager: https://basescan.org/address/0x498581fF718922c3f8e6A244956aF099B2652b2b
    // -------------------------------------------------------------------------
    address constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant USDC         = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant WETH         = 0x4200000000000000000000000000000000000006;

    // Clanker V4 hook used by both CLAWD and BNKRW (StaticFeeV2)
    address constant CLANKER_STATIC_FEE_V2 = 0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC;

    // CLAWD — top Bankr ecosystem token by market cap
    address constant CLAWD = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;

    // BNKRW — Bankr reward token
    address constant BNKRW = 0xf48bC234855aB08ab2EC0cfaaEb2A80D065a3b07;

    // -------------------------------------------------------------------------
    // Operational parameters
    // -------------------------------------------------------------------------
    // Min V4 pool liquidity for market registration + runtime price reads.
    // CLAWD/WETH and BNKRW/WETH both have ~1e24 liquidity — 8e23 is a safe gate.
    uint128 constant MIN_LIQUIDITY = 800_000_000_000_000_000_000_000; // 8e23

    // Per-round USDC pool cap. Bounds worst-case flash loan attack profit.
    // 10,000 USDC = 10_000 * 1e6 (USDC 6 decimals).
    uint256 constant MAX_ROUND_POOL = 10_000_000_000; // 10,000 USDC

    // Clanker pool parameters (same for all supported Bankr/Clanker V4 pools)
    uint24  constant DYNAMIC_FEE_FLAG     = 0x800000;
    int24   constant CLANKER_TICK_SPACING = 200;

    function run() external {
        require(block.chainid == 8453, "Deploy to Base mainnet only (chain 8453)");

        vm.startBroadcast();

        // -----------------------------------------------------------------
        // 1. Deploy Oracle
        // -----------------------------------------------------------------
        BankrBetsOracle oracle = new BankrBetsOracle(POOL_MANAGER);

        // -----------------------------------------------------------------
        // 2. Deploy Prediction
        // -----------------------------------------------------------------
        BankrBetsPrediction prediction = new BankrBetsPrediction(USDC, address(oracle));

        // -----------------------------------------------------------------
        // 3. Wire oracle → prediction
        //    Required before any market registration or active-round checks.
        // -----------------------------------------------------------------
        oracle.setPredictionContract(address(prediction));

        // -----------------------------------------------------------------
        // 4. Oracle operational params
        // -----------------------------------------------------------------
        oracle.setMinLiquidity(MIN_LIQUIDITY);

        // -----------------------------------------------------------------
        // 5. Prediction operational params
        //    All other params (roundDuration, betWindow, fees, etc.) are
        //    already set to production values in contract defaults.
        // -----------------------------------------------------------------
        prediction.setMaxRoundPool(MAX_ROUND_POOL);

        // -----------------------------------------------------------------
        // 6. Register initial markets
        // -----------------------------------------------------------------
        // CLAWD/WETH pool — WETH is currency0 (0x4200 < 0x9f86)
        PoolKey memory clawdKey = PoolKey({
            currency0:   Currency.wrap(WETH),
            currency1:   Currency.wrap(CLAWD),
            fee:         DYNAMIC_FEE_FLAG,
            tickSpacing: CLANKER_TICK_SPACING,
            hooks:       IHooks(CLANKER_STATIC_FEE_V2)
        });
        oracle.addToken(CLAWD, clawdKey);

        // BNKRW/WETH pool — WETH is currency0 (0x4200 < 0xf48b)
        PoolKey memory bnkrwKey = PoolKey({
            currency0:   Currency.wrap(WETH),
            currency1:   Currency.wrap(BNKRW),
            fee:         DYNAMIC_FEE_FLAG,
            tickSpacing: CLANKER_TICK_SPACING,
            hooks:       IHooks(CLANKER_STATIC_FEE_V2)
        });
        oracle.addToken(BNKRW, bnkrwKey);

        vm.stopBroadcast();

        // -----------------------------------------------------------------
        // 7. Log everything for post-deploy verification
        // -----------------------------------------------------------------
        console.log("=== BankrBets Deployment ===");
        console.log("Chain ID             :", block.chainid);
        console.log("Deployer / Owner     :", msg.sender);
        console.log("");
        console.log("BankrBetsOracle      :", address(oracle));
        console.log("BankrBetsPrediction  :", address(prediction));
        console.log("");
        console.log("--- Oracle config ---");
        console.log("predictionContract   :", address(prediction));
        console.log("minLiquidity         :", MIN_LIQUIDITY);
        console.log("");
        console.log("--- Prediction config ---");
        console.log("betToken (USDC)      :", USDC);
        console.log("maxRoundPool (USDC)  :", MAX_ROUND_POOL);
        console.log("roundDuration (s)    :", prediction.roundDuration());
        console.log("betWindow (s)        :", prediction.betWindow());
        console.log("lockGracePeriod (s)  :", prediction.lockGracePeriod());
        console.log("minBetAmount         :", prediction.minBetAmount());
        console.log("treasuryFeeBps       :", prediction.treasuryFeeBps());
        console.log("settlerFeeBps        :", prediction.settlerFeeBps());
        console.log("maxPriceMoveBps      :", prediction.maxPriceMoveBps());
        console.log("");
        console.log("--- Initial markets ---");
        console.log("CLAWD active         :", oracle.isTokenActive(CLAWD));
        console.log("BNKRW active         :", oracle.isTokenActive(BNKRW));
    }
}
