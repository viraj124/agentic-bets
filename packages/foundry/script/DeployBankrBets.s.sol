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
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant WETH = 0x4200000000000000000000000000000000000006;

    // Clanker V4 hook used by CLAWD and MOLT (StaticFeeV2, PoolId-verified)
    address constant CLANKER_STATIC_FEE_V2 = 0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC;

    // CLAWD — top Bankr ecosystem token by market cap
    address constant CLAWD = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;

    // WCHAN (WalletChan) — rebranded from BNKRW
    // Vanilla V4 pool: native ETH + no hooks + fee=10000 + tickSpacing=200
    // PoolId: 0x81c7a2a2c33ea285f062c5ac0c4e3d4ffb2f6fd2588bbd354d0d3af8a58b6337
    address constant WCHAN = 0xBa5ED0000e1CA9136a695f0a848012A16008B032;

    // MOLT (Moltbook) — #3 Bankr ecosystem token by market cap
    // PoolId verified: 0x15f351bf...464dd
    address constant MOLT = 0xB695559b26BB2c9703ef1935c37AeaE9526bab07;

    // -------------------------------------------------------------------------
    // Operational parameters
    // -------------------------------------------------------------------------
    // Min V4 pool liquidity for market registration + runtime price reads.
    // CLAWD ~1e24, WCHAN ~1.93e23 — 1e22 keeps all healthy pools while blocking empty ones.
    uint128 constant MIN_LIQUIDITY = 10_000_000_000_000_000_000_000; // 1e22

    // Per-round USDC pool cap. Bounds worst-case flash loan attack profit.
    // 10,000 USDC = 10_000 * 1e6 (USDC 6 decimals).
    uint256 constant MAX_ROUND_POOL = 10_000_000_000; // 10,000 USDC

    // Clanker pool parameters (same for all supported Bankr/Clanker V4 pools)
    uint24 constant DYNAMIC_FEE_FLAG = 0x800000;
    int24 constant TICK_SPACING = 200;

    // WCHAN vanilla V4 pool parameters
    uint24 constant WCHAN_FEE = 10_000; // 1%

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
        // 4. Prediction operational params
        //    All other params (roundDuration, betWindow, fees, etc.) are
        //    already set to production values in contract defaults.
        // -----------------------------------------------------------------
        prediction.setMaxRoundPool(MAX_ROUND_POOL);

        // -----------------------------------------------------------------
        // 5. Register initial markets (before setting minLiquidity so
        //    vanilla pools with lower liquidity like WCHAN aren't blocked)
        // -----------------------------------------------------------------
        // CLAWD/WETH pool — WETH is currency0 (0x4200 < 0x9f86)
        PoolKey memory clawdKey = PoolKey({ currency0: Currency.wrap(WETH), currency1: Currency.wrap(CLAWD), fee: DYNAMIC_FEE_FLAG, tickSpacing: TICK_SPACING, hooks: IHooks(CLANKER_STATIC_FEE_V2) });
        oracle.addToken(CLAWD, clawdKey);

        // WCHAN/ETH pool — native ETH is currency0 (address(0) < 0xBa5E), no hooks
        PoolKey memory wchanKey = PoolKey({ currency0: Currency.wrap(address(0)), currency1: Currency.wrap(WCHAN), fee: WCHAN_FEE, tickSpacing: TICK_SPACING, hooks: IHooks(address(0)) });
        oracle.addToken(WCHAN, wchanKey);

        // MOLT/WETH pool — WETH is currency0 (0x4200 < 0xB695)
        PoolKey memory moltKey = PoolKey({ currency0: Currency.wrap(WETH), currency1: Currency.wrap(MOLT), fee: DYNAMIC_FEE_FLAG, tickSpacing: TICK_SPACING, hooks: IHooks(CLANKER_STATIC_FEE_V2) });
        oracle.addToken(MOLT, moltKey);

        // -----------------------------------------------------------------
        // 6. Oracle operational params (after registration so vanilla
        //    pools aren't blocked by the liquidity threshold)
        // -----------------------------------------------------------------
        oracle.setMinLiquidity(MIN_LIQUIDITY);

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
        console.log("WCHAN active         :", oracle.isTokenActive(WCHAN));
        console.log("MOLT  active         :", oracle.isTokenActive(MOLT));
    }
}
