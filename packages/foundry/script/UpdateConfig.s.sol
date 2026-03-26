// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../contracts/BankrBetsPrediction.sol";

/**
 * @notice Post-deploy configuration for BankrBets v2.
 *
 * Usage:
 *   forge script script/UpdateConfig.s.sol \
 *     --rpc-url $BASE_RPC_URL \
 *     --broadcast
 *
 * Required env: PRIVATE_KEY (owner of BankrBetsPrediction)
 */
contract UpdateConfig is Script {
    address constant PREDICTION = 0xABADeb002247f2bd908Eeedb32918aEc304A0233;

    function run() external {
        require(block.chainid == 8453, "Base mainnet only");
        vm.startBroadcast();

        BankrBetsPrediction prediction = BankrBetsPrediction(PREDICTION);

        // 5-minute bet window (up from 4 min)
        prediction.setBetWindow(300);

        // 10-minute lock-to-close (up from 5 min) — matches CLAWD/MOLT swap frequency
        prediction.setRoundDuration(600);

        // MajorityWins tiebreaker — side with more USDC wins on ties
        prediction.setTiebreakerMode(BankrBetsPrediction.TiebreakerMode.MajorityWins);

        vm.stopBroadcast();

        console.log("=== ConfigureV2 ===");
        console.log("roundDuration  :", prediction.roundDuration());
        console.log("betWindow      :", prediction.betWindow());
        console.log("tiebreakerMode :", uint8(prediction.tiebreakerMode()));
    }
}
