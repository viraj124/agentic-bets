// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import "../contracts/BankrBetsOracle.sol";

/**
 * @notice Register the 🟦 (square) prediction market on the V2 oracle.
 *
 * 🟦 is one of the few Bankr UI tokens with a real V4 pool. It lives on a
 * vanilla V4 pool paired with native ETH, so the oracle will accept it
 * without any hook allowlisting.
 *
 *   token        0x0f758aBF9b242dAa6B2b5e976d6e00C5AECE9b07
 *   pool id      0xb40a4f3c6404df20a761aea12a2f5d6cb7179d8821542d1e7ae9db372547913e
 *   currency0    0x0 (native ETH)
 *   currency1    0x0f758aBF9b242dAa6B2b5e976d6e00C5AECE9b07
 *   fee          10_000 (1%)
 *   tickSpacing  200
 *   hooks        0x0 (vanilla)
 *
 * Usage:
 *   forge script script/AddCustomHooks.s.sol \
 *     --rpc-url $BASE_RPC_URL \
 *     --broadcast
 *
 *   ORACLE=0x... forge script script/AddCustomHooks.s.sol ...
 *
 * Required env: PRIVATE_KEY
 * Optional env: ORACLE (defaults to the V2 oracle)
 */
contract AddCustomHooks is Script {
    // V2 oracle — the 🟦 market should live alongside AGBETS on V2.
    address constant DEFAULT_ORACLE = 0xd45360693a3769f0E80EA901F4698dCC9FcC917C;

    address constant SQUARE_TOKEN = 0x0f758aBF9b242dAa6B2b5e976d6e00C5AECE9b07;

    function run() external {
        require(block.chainid == 8453, "Base mainnet only");

        address oracleAddress = vm.envOr("ORACLE", DEFAULT_ORACLE);
        BankrBetsOracle oracle = BankrBetsOracle(oracleAddress);

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(SQUARE_TOKEN),
            fee: 10_000,
            tickSpacing: 200,
            hooks: IHooks(address(0))
        });

        vm.startBroadcast();

        console.log("Target oracle:");
        console.logAddress(oracleAddress);

        if (oracle.isTokenActive(SQUARE_TOKEN)) {
            console.log("Market already registered for 0x0f75...bb07, nothing to do");
        } else {
            oracle.addToken(SQUARE_TOKEN, poolKey);
            console.log("Registered 0x0f75...bb07 market");
        }

        vm.stopBroadcast();
    }
}
