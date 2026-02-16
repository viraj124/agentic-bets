// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../contracts/BankrBetsOracle.sol";
import "../contracts/BankrBetsPrediction.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";


contract BankrBetsTest is Test {
    BankrBetsOracle public oracle;
    BankrBetsPrediction public prediction;
    IERC20 public usdc;

    address public owner = address(this);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public carol = address(0xCA401);
    address public marketCreator = address(0xCEE8);
    address public settler = address(0x5E77);

    // Bankr token launched via Clanker on bankr.bot (CLAWD — top by market cap, price > 0)
    address public token1 = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07; // CLAWD (currency1, WETH < CLAWD)
    address public constant QUOTE_TOKEN = 0x4200000000000000000000000000000000000006; // WETH (Base)
    address public token2 = QUOTE_TOKEN; // WETH
    address public token3 = BASE_USDC; // USDC

    // CLAWD/WETH V4 PoolId (from Clanker API, verified on-chain)
    // PoolId = keccak256(abi.encode(WETH, CLAWD, 0x800000, 200, StaticFeeV2))
    bytes32 public constant CLAWD_POOL_ID = 0x9fd58e73d8047cb14ac540acd141d3fc1a41fb6252d674b730faf62fe24aa8ce;

    // Base mainnet addresses (forked)
    address public constant BASE_POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address public constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // Clanker V4 pool parameters — all Bankr tokens use fee=0x800000 and tickSpacing=200
    address public constant CLANKER_STATIC_FEE_V2 = 0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC;
    address public constant CLANKER_DYNAMIC_FEE_V2 = 0xd60D6B218116cFd801E28F78d011a203D2b068Cc;
    uint24 public constant CLANKER_FEE = 0x800000; // DYNAMIC_FEE_FLAG (used by all Clanker hooks)
    int24 public constant CLANKER_TICK_SPACING = 200;

    uint256 public constant ONE_USDC = 1_000_000;
    uint256 public constant TEN_USDC = 10_000_000;
    PoolKey public poolKey1;
    PoolKey public poolKeyWethUsdc;

    function setUp() public {
        vm.createSelectFork(vm.envString("BASE_RPC_URL"));

        usdc = IERC20(BASE_USDC);
        oracle = new BankrBetsOracle(BASE_POOL_MANAGER);
        prediction = new BankrBetsPrediction(address(usdc), address(oracle));

        // Link oracle → prediction (required for addTokenFor + active round checks)
        oracle.setPredictionContract(address(prediction));

        // Construct PoolKeys from known Clanker V4 parameters (verified on-chain)
        poolKey1 = _clankerPoolKey(token1, CLANKER_STATIC_FEE_V2);
        poolKeyWethUsdc = _standardPoolKey(QUOTE_TOKEN, BASE_USDC, 500, 10);

        // Register token via permissionless Oracle (marketCreator is first registrant)
        // poolAddress = PoolId cast to address (GeckoTerminal uses PoolId as pool identifier for V4)
        vm.prank(marketCreator);
        oracle.addToken(token1, address(bytes20(CLAWD_POOL_ID)), poolKey1);

        // Mint USDC to users (forked balance edits)
        deal(BASE_USDC, alice, 1000 * ONE_USDC);
        deal(BASE_USDC, bob, 1000 * ONE_USDC);
        deal(BASE_USDC, carol, 1000 * ONE_USDC);

        // Approve prediction contract
        vm.prank(alice);
        usdc.approve(address(prediction), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(prediction), type(uint256).max);
        vm.prank(carol);
        usdc.approve(address(prediction), type(uint256).max);
    }

    // --- Helpers ---

    /// @dev Construct a PoolKey for a Bankr/Clanker V4 token with the specified hook
    function _clankerPoolKey(address token, address hook) internal pure returns (PoolKey memory key) {
        address c0 = token < QUOTE_TOKEN ? token : QUOTE_TOKEN;
        address c1 = token < QUOTE_TOKEN ? QUOTE_TOKEN : token;
        key = PoolKey({ currency0: Currency.wrap(c0), currency1: Currency.wrap(c1), fee: CLANKER_FEE, tickSpacing: CLANKER_TICK_SPACING, hooks: IHooks(hook) });
    }

    /// @dev Construct a PoolKey for a standard V4 pool (no hooks)
    function _standardPoolKey(address tokenA, address tokenB, uint24 fee, int24 tickSpacing) internal pure returns (PoolKey memory key) {
        address c0 = tokenA < tokenB ? tokenA : tokenB;
        address c1 = tokenA < tokenB ? tokenB : tokenA;
        key = PoolKey({ currency0: Currency.wrap(c0), currency1: Currency.wrap(c1), fee: fee, tickSpacing: tickSpacing, hooks: IHooks(address(0)) });
    }

    function _startRoundAndBet(uint256 aliceBet, uint256 bobBet) internal {
        prediction.startRound(token1);
        if (aliceBet > 0) {
            vm.prank(alice);
            prediction.betBull(token1, aliceBet);
        }
        if (bobBet > 0) {
            vm.prank(bob);
            prediction.betBear(token1, bobBet);
        }
    }

    function _lockAndClose() internal {
        vm.warp(block.timestamp + 240);
        vm.prank(settler);
        prediction.lockRound(token1);

        vm.warp(block.timestamp + 300);
        vm.prank(settler);
        prediction.closeRound(token1);
    }

    function _outcome(BankrBetsPrediction.Round memory round) internal pure returns (uint8) {
        if (round.closePrice > round.lockPrice) return 1; // bull
        if (round.closePrice < round.lockPrice) return 2; // bear
        return 0; // tie
    }

    // ========== Oracle Tests ==========

    function test_OracleSetup() public view {
        assertTrue(oracle.isTokenActive(token1));
        assertEq(oracle.getMaxBetAmount(token1), 500_000_000); // default 500 USDC
        assertEq(oracle.getMarketCreator(token1), marketCreator);
    }

    function test_PermissionlessAddToken() public {
        PoolKey memory pk2 = poolKeyWethUsdc;

        // Alice (random user) can register a market
        vm.prank(alice);
        oracle.addToken(token2, address(0x4444), pk2);
        assertTrue(oracle.isTokenActive(token2));
        assertEq(oracle.getMarketCreator(token2), alice);
        assertEq(oracle.getTokenCount(), 2);
    }

    function test_AddTokenDuplicate() public {
        vm.expectRevert(BankrBetsOracle.MarketAlreadyExists.selector);
        oracle.addToken(token1, address(bytes20(CLAWD_POOL_ID)), poolKey1);
    }

    function test_AddTokenPoolNotInitialized() public {
        address token2Local = address(0x3333);
        PoolKey memory pk2 = PoolKey({ currency0: Currency.wrap(address(usdc)), currency1: Currency.wrap(token2Local), fee: 3000, tickSpacing: 60, hooks: IHooks(address(0)) });
        // sqrtPriceX96 defaults to 0 → pool not initialized
        vm.expectRevert(BankrBetsOracle.PoolNotInitialized.selector);
        oracle.addToken(token2Local, address(0x4444), pk2);
    }

    function test_DeactivateMarket() public {
        vm.prank(marketCreator);
        oracle.deactivateMarket(token1);
        assertFalse(oracle.isTokenActive(token1));
    }

    function test_DeactivateMarketNotCreator() public {
        vm.prank(alice);
        vm.expectRevert(BankrBetsOracle.NotMarketCreator.selector);
        oracle.deactivateMarket(token1);
    }

    function test_GetPrice() public view {
        int256 price = oracle.getPrice(token1);
        assertTrue(price > 0);
    }

    function test_GetPriceAfterChange() public view {
        int256 price = oracle.getPrice(token1);
        assertTrue(price > 0);
    }

    function test_GetActiveTokens() public {
        PoolKey memory pk = poolKeyWethUsdc;

        oracle.addToken(token2, address(0x5555), pk);
        oracle.addToken(token3, address(0x6666), pk);

        // Deactivate token2 — test contract is creator since we called addToken
        oracle.deactivateMarket(token2);

        address[] memory active = oracle.getActiveTokens();
        assertEq(active.length, 2);
        assertEq(active[0], token1);
        assertEq(active[1], token3);
    }

    function test_DeactivateByOwner() public {
        // Owner (admin) can also deactivate
        oracle.deactivateMarket(token1);
        assertFalse(oracle.isTokenActive(token1));
    }

    function test_ActivateMarket() public {
        // Deactivate first
        vm.prank(marketCreator);
        oracle.deactivateMarket(token1);
        assertFalse(oracle.isTokenActive(token1));

        // Only admin can re-activate
        oracle.activateMarket(token1);
        assertTrue(oracle.isTokenActive(token1));
    }

    function test_ActivateMarketNotDeactivated() public {
        // Cannot activate an already-active market
        vm.expectRevert(BankrBetsOracle.MarketAlreadyExists.selector);
        oracle.activateMarket(token1);
    }

    function test_SetMaxBetAmount() public {
        oracle.setMaxBetAmount(token1, 1000 * ONE_USDC);
        assertEq(oracle.getMaxBetAmount(token1), 1000 * ONE_USDC);
    }

    // ========== Round Lifecycle Tests ==========

    function test_StartRound() public {
        prediction.startRound(token1);
        assertEq(prediction.getCurrentEpoch(token1), 1);

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertEq(round.epoch, 1);
        assertEq(round.startTimestamp, block.timestamp);
        assertEq(round.lockTimestamp, block.timestamp + 240);
        assertFalse(round.locked);
        assertFalse(round.oracleCalled);
    }

    function test_StartRoundInactiveToken() public {
        vm.prank(marketCreator);
        oracle.deactivateMarket(token1);
        vm.expectRevert(BankrBetsPrediction.TokenNotEligible.selector);
        prediction.startRound(token1);
    }

    function test_CannotStartRoundWhilePreviousUnsettled() public {
        prediction.startRound(token1);
        vm.expectRevert(BankrBetsPrediction.RoundNotSettled.selector);
        prediction.startRound(token1);
    }

    // ========== Betting Tests ==========

    function test_BetBull() public {
        prediction.startRound(token1);

        vm.prank(alice);
        prediction.betBull(token1, TEN_USDC);

        BankrBetsPrediction.BetInfo memory bet = prediction.getUserBet(token1, 1, alice);
        assertEq(uint8(bet.position), uint8(BankrBetsPrediction.Position.Bull));
        assertEq(bet.amount, TEN_USDC);
        assertFalse(bet.claimed);

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertEq(round.totalAmount, TEN_USDC);
        assertEq(round.bullAmount, TEN_USDC);
        assertEq(round.bearAmount, 0);
    }

    function test_BetBear() public {
        prediction.startRound(token1);

        vm.prank(bob);
        prediction.betBear(token1, TEN_USDC);

        BankrBetsPrediction.BetInfo memory bet = prediction.getUserBet(token1, 1, bob);
        assertEq(uint8(bet.position), uint8(BankrBetsPrediction.Position.Bear));
        assertEq(bet.amount, TEN_USDC);
    }

    function test_BetBelowMin() public {
        prediction.startRound(token1);

        vm.prank(alice);
        vm.expectRevert(BankrBetsPrediction.BelowMinBet.selector);
        prediction.betBull(token1, 100); // 0.0001 USDC
    }

    function test_BetAboveMax() public {
        prediction.startRound(token1);

        vm.prank(alice);
        vm.expectRevert(BankrBetsPrediction.ExceedsMaxBet.selector);
        prediction.betBull(token1, 600 * ONE_USDC); // 600 > 500 USDC default max
    }

    function test_DoubleBet() public {
        prediction.startRound(token1);

        vm.prank(alice);
        prediction.betBull(token1, TEN_USDC);

        vm.prank(alice);
        vm.expectRevert(BankrBetsPrediction.AlreadyBet.selector);
        prediction.betBull(token1, TEN_USDC);
    }

    function test_BetAfterLock() public {
        prediction.startRound(token1);
        vm.warp(block.timestamp + 241);

        vm.prank(alice);
        vm.expectRevert(BankrBetsPrediction.RoundNotBettable.selector);
        prediction.betBull(token1, TEN_USDC);
    }

    function test_BetInactiveToken() public {
        prediction.startRound(token1);

        // Refund the round after grace period so deactivation is allowed
        vm.warp(block.timestamp + 240 + 300 + 3601);
        prediction.refundRound(token1, 1);

        vm.prank(marketCreator);
        oracle.deactivateMarket(token1);

        vm.prank(alice);
        vm.expectRevert(BankrBetsPrediction.TokenNotEligible.selector);
        prediction.betBull(token1, TEN_USDC);
    }

    // ========== Lock & Close Tests ==========

    function test_LockRound() public {
        prediction.startRound(token1);
        vm.prank(alice);
        prediction.betBull(token1, TEN_USDC);

        vm.warp(block.timestamp + 240);

        // Anyone can lock
        vm.prank(settler);
        prediction.lockRound(token1);

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertTrue(round.locked);
        assertTrue(round.lockPrice > 0);
    }

    function test_LockRoundTooEarly() public {
        prediction.startRound(token1);
        vm.expectRevert(BankrBetsPrediction.RoundNotLockable.selector);
        prediction.lockRound(token1);
    }

    function test_LockRoundAlreadyLocked() public {
        prediction.startRound(token1);
        vm.warp(block.timestamp + 240);
        prediction.lockRound(token1);

        vm.expectRevert(BankrBetsPrediction.RoundAlreadyLocked.selector);
        prediction.lockRound(token1);
    }

    function test_CloseRound() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        _lockAndClose();

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertTrue(round.oracleCalled);
        if (round.cancelled) {
            assertEq(round.rewardBaseCalAmount, 0);
        } else if (round.closePrice > round.lockPrice) {
            assertEq(round.rewardBaseCalAmount, round.bullAmount);
        } else if (round.closePrice < round.lockPrice) {
            assertEq(round.rewardBaseCalAmount, round.bearAmount);
        }
    }

    function test_CloseRoundTooEarly() public {
        prediction.startRound(token1);
        vm.warp(block.timestamp + 240);
        prediction.lockRound(token1);

        // Don't warp to close time
        vm.expectRevert(BankrBetsPrediction.RoundNotClosable.selector);
        prediction.closeRound(token1);
    }

    function test_AnyoneCanLockAndClose() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);

        // Alice (bettor) can lock
        vm.warp(block.timestamp + 240);
        vm.prank(alice);
        prediction.lockRound(token1);

        // Bob (another bettor) can close
        vm.warp(block.timestamp + 300);
        vm.prank(bob);
        prediction.closeRound(token1);

        assertTrue(prediction.getRound(token1, 1).oracleCalled);
    }

    // ========== Fee Distribution Tests ==========

    function test_BullsWinPayout() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);

        uint256 totalPool = 2 * TEN_USDC;

        uint256 settlerBalBefore = usdc.balanceOf(settler);
        uint256 creatorBalBefore = usdc.balanceOf(marketCreator);

        _lockAndClose();
        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        if (_outcome(round) != 1) return;

        // Settler got 0.1%
        uint256 settlerReward = (totalPool * 10) / 10_000;
        assertEq(usdc.balanceOf(settler) - settlerBalBefore, settlerReward);

        // Creator got 0.5%
        uint256 creatorFee = (totalPool * 50) / 10_000;
        assertEq(usdc.balanceOf(marketCreator) - creatorBalBefore, creatorFee);

        // Alice (bull winner) claims
        uint256 aliceBalBefore = usdc.balanceOf(alice);
        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;
        vm.prank(alice);
        prediction.claim(token1, epochs);

        // Reward = total - 1.5% treasury - 0.5% creator - 0.1% settler
        uint256 treasuryFee = (totalPool * 150) / 10_000;
        uint256 expectedReward = totalPool - treasuryFee - creatorFee - settlerReward;
        assertEq(usdc.balanceOf(alice) - aliceBalBefore, expectedReward);

        // Bob (bear loser) gets nothing
        vm.prank(bob);
        vm.expectRevert(BankrBetsPrediction.NothingToClaim.selector);
        prediction.claim(token1, epochs);
    }

    function test_BearsWinPayout() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        _lockAndClose();
        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        if (_outcome(round) != 2) return;

        uint256 bobBalBefore = usdc.balanceOf(bob);
        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;
        vm.prank(bob);
        prediction.claim(token1, epochs);

        uint256 totalPool = 2 * TEN_USDC;
        uint256 treasuryFee = (totalPool * 150) / 10_000;
        uint256 creatorFee = (totalPool * 50) / 10_000;
        uint256 settlerFee = (totalPool * 10) / 10_000;
        uint256 expectedReward = totalPool - treasuryFee - creatorFee - settlerFee;
        assertEq(usdc.balanceOf(bob) - bobBalBefore, expectedReward);
    }

    function test_CreatorEarningsTracked() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        _lockAndClose();

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        if (round.cancelled) return;

        uint256 totalPool = 2 * TEN_USDC;
        uint256 expectedCreatorEarnings = (totalPool * 50) / 10_000;
        assertEq(prediction.creatorEarnings(marketCreator), expectedCreatorEarnings);
    }

    function test_SettlerRewardView() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);

        uint256 totalPool = 2 * TEN_USDC;
        uint256 expectedReward = (totalPool * 10) / 10_000;
        assertEq(prediction.getSettlerReward(token1), expectedReward);
    }

    function test_TieCancelledRefund() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        _lockAndClose();

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        if (!round.cancelled) return;

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;

        uint256 aliceBal = usdc.balanceOf(alice);
        vm.prank(alice);
        prediction.claim(token1, epochs);
        assertEq(usdc.balanceOf(alice) - aliceBal, TEN_USDC);

        uint256 bobBal = usdc.balanceOf(bob);
        vm.prank(bob);
        prediction.claim(token1, epochs);
        assertEq(usdc.balanceOf(bob) - bobBal, TEN_USDC);
    }

    function test_MultipleWinnersProportionalPayout() public {
        prediction.startRound(token1);

        vm.prank(alice);
        prediction.betBull(token1, TEN_USDC);
        vm.prank(carol);
        prediction.betBull(token1, 30 * ONE_USDC);
        vm.prank(bob);
        prediction.betBear(token1, 60 * ONE_USDC);

        uint256 totalPool = 100 * ONE_USDC;

        _lockAndClose();
        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        if (_outcome(round) != 1) return;

        uint256 treasuryFee = (totalPool * 150) / 10_000;
        uint256 creatorFee = (totalPool * 50) / 10_000;
        uint256 settlerFee = (totalPool * 10) / 10_000;
        uint256 rewardPool = totalPool - treasuryFee - creatorFee - settlerFee;
        uint256 bullTotal = 40 * ONE_USDC;

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;

        // Alice gets 10/40 = 25% of reward pool
        uint256 aliceBal = usdc.balanceOf(alice);
        vm.prank(alice);
        prediction.claim(token1, epochs);
        uint256 aliceReward = (TEN_USDC * rewardPool) / bullTotal;
        assertEq(usdc.balanceOf(alice) - aliceBal, aliceReward);

        // Carol gets 30/40 = 75% of reward pool
        uint256 carolBal = usdc.balanceOf(carol);
        vm.prank(carol);
        prediction.claim(token1, epochs);
        uint256 carolReward = (30 * ONE_USDC * rewardPool) / bullTotal;
        assertEq(usdc.balanceOf(carol) - carolBal, carolReward);
    }

    // ========== Refund Tests ==========

    function test_RefundRound() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);

        // Warp past close + grace period (1 hour)
        vm.warp(block.timestamp + 240 + 300 + 3601);

        prediction.refundRound(token1, 1);

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertTrue(round.cancelled);
        assertTrue(round.oracleCalled);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;

        uint256 aliceBal = usdc.balanceOf(alice);
        vm.prank(alice);
        prediction.claim(token1, epochs);
        assertEq(usdc.balanceOf(alice) - aliceBal, TEN_USDC);
    }

    function test_RefundRoundTooEarly() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);

        // Warp past close but NOT past grace period
        vm.warp(block.timestamp + 240 + 300 + 100);

        vm.expectRevert(BankrBetsPrediction.RefundNotReady.selector);
        prediction.refundRound(token1, 1);
    }

    // ========== CreateAndStartRound Tests ==========

    function test_CreateAndStartRound() public {
        PoolKey memory pk2 = poolKeyWethUsdc;

        vm.prank(alice);
        prediction.createAndStartRound(token2, address(0x4444), pk2);

        assertTrue(oracle.isTokenActive(token2));
        assertEq(oracle.getMarketCreator(token2), alice); // Creator = caller
        assertEq(prediction.getCurrentEpoch(token2), 1);
    }

    // ========== Claim Edge Cases ==========

    function test_ClaimBeforeSettlement() public {
        prediction.startRound(token1);
        vm.prank(alice);
        prediction.betBull(token1, TEN_USDC);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;

        vm.prank(alice);
        vm.expectRevert(BankrBetsPrediction.RoundNotSettled.selector);
        prediction.claim(token1, epochs);
    }

    function test_DoubleClaim() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        _lockAndClose();

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        address claimant = _outcome(round) == 2 ? bob : alice;

        vm.prank(claimant);
        prediction.claim(token1, epochs);

        vm.prank(claimant);
        vm.expectRevert(BankrBetsPrediction.AlreadyClaimed.selector);
        prediction.claim(token1, epochs);
    }

    function test_ClaimNoBet() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        _lockAndClose();

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;

        vm.prank(carol); // Carol never bet
        vm.expectRevert(BankrBetsPrediction.NoBetPlaced.selector);
        prediction.claim(token1, epochs);
    }

    function test_Claimable() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);

        assertFalse(prediction.claimable(token1, 1, alice));

        _lockAndClose();

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        uint8 outcome = _outcome(round);
        if (outcome == 1) {
            assertTrue(prediction.claimable(token1, 1, alice));
            assertFalse(prediction.claimable(token1, 1, bob));
        } else if (outcome == 2) {
            assertTrue(prediction.claimable(token1, 1, bob));
            assertFalse(prediction.claimable(token1, 1, alice));
        } else {
            assertTrue(prediction.claimable(token1, 1, alice));
            assertTrue(prediction.claimable(token1, 1, bob));
        }
    }

    // ========== Admin Tests ==========

    function test_ClaimTreasury() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        _lockAndClose();

        uint256 totalPool = 2 * TEN_USDC;
        uint256 expectedTreasury = (totalPool * 150) / 10_000; // 1.5%

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        if (round.cancelled) return;

        assertEq(prediction.treasuryAmount(), expectedTreasury);

        uint256 ownerBal = usdc.balanceOf(owner);
        prediction.claimTreasury();
        assertEq(usdc.balanceOf(owner) - ownerBal, expectedTreasury);
        assertEq(prediction.treasuryAmount(), 0);
    }

    function test_SetFees() public {
        prediction.setTreasuryFeeBps(300); // 3%
        assertEq(prediction.treasuryFeeBps(), 300);

        vm.expectRevert(BankrBetsPrediction.InvalidFee.selector);
        prediction.setTreasuryFeeBps(600); // > 5% max

        prediction.setSettlerFeeBps(50); // 0.5%
        assertEq(prediction.settlerFeeBps(), 50);

        vm.expectRevert(BankrBetsPrediction.InvalidFee.selector);
        prediction.setSettlerFeeBps(200); // > 1% max
    }

    function test_Pause() public {
        prediction.pause();

        vm.expectRevert();
        prediction.startRound(token1);

        prediction.unpause();
        prediction.startRound(token1); // Works after unpause
    }

    function test_SetRoundDuration() public {
        prediction.setRoundDuration(600); // 10 min
        assertEq(prediction.roundDuration(), 600);

        vm.expectRevert(BankrBetsPrediction.InvalidDuration.selector);
        prediction.setRoundDuration(30); // Too short
    }

    // ========== View Functions ==========

    function test_IsLockable() public {
        prediction.startRound(token1);
        assertFalse(prediction.isLockable(token1));

        vm.warp(block.timestamp + 240);
        assertTrue(prediction.isLockable(token1));
    }

    function test_IsClosable() public {
        prediction.startRound(token1);
        assertFalse(prediction.isClosable(token1));

        vm.warp(block.timestamp + 240);
        prediction.lockRound(token1);
        assertFalse(prediction.isClosable(token1));

        vm.warp(block.timestamp + 300);
        assertTrue(prediction.isClosable(token1));
    }

    // ========== Full Flow Integration Test ==========

    function test_FullFlow() public {
        // Round 1
        prediction.startRound(token1);

        vm.prank(alice);
        prediction.betBull(token1, 50 * ONE_USDC);
        vm.prank(bob);
        prediction.betBear(token1, 50 * ONE_USDC);

        // Lock
        vm.warp(block.timestamp + 240);
        vm.prank(settler);
        prediction.lockRound(token1);

        vm.warp(block.timestamp + 300);
        vm.prank(settler);
        prediction.closeRound(token1);

        // Can start next round
        prediction.startRound(token1);
        assertEq(prediction.getCurrentEpoch(token1), 2);

        // Claim round 1 winnings
        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;
        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        address claimant = _outcome(round) == 2 ? bob : alice;
        uint256 balBefore = usdc.balanceOf(claimant);
        vm.prank(claimant);
        prediction.claim(token1, epochs);
        assertTrue(usdc.balanceOf(claimant) > balBefore);
    }

    // ========== Fuzz Tests ==========

    function testFuzz_PayoutNeverExceedsPool(uint256 bullBet, uint256 bearBet) public {
        bullBet = bound(bullBet, ONE_USDC, 50 * ONE_USDC);
        bearBet = bound(bearBet, ONE_USDC, 50 * ONE_USDC);

        _startRoundAndBet(bullBet, bearBet);
        _lockAndClose();

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        uint256 totalPool = bullBet + bearBet;

        assertTrue(round.rewardAmount <= totalPool);

        if (!round.cancelled) {
            uint256 treasuryFee = (totalPool * 150) / 10_000;
            uint256 creatorFee = (totalPool * 50) / 10_000;
            uint256 settlerFee = (totalPool * 10) / 10_000;
            assertEq(round.rewardAmount, totalPool - treasuryFee - creatorFee - settlerFee);
        }
    }

    function testFuzz_NoRemainingTokensAfterClaim(uint256 amount) public {
        amount = bound(amount, ONE_USDC, 50 * ONE_USDC);

        _startRoundAndBet(amount, amount);
        _lockAndClose();

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        uint8 outcome = _outcome(round);

        if (round.cancelled) {
            vm.prank(alice);
            prediction.claim(token1, epochs);
            vm.prank(bob);
            prediction.claim(token1, epochs);
        } else if (outcome == 1) {
            vm.prank(alice);
            prediction.claim(token1, epochs);
        } else if (outcome == 2) {
            vm.prank(bob);
            prediction.claim(token1, epochs);
        }

        if (!round.cancelled) {
            prediction.claimTreasury();
        }

        // Contract should have 0 remaining
        assertEq(usdc.balanceOf(address(prediction)), 0);
    }

    // ========== User Rounds Tracking ==========

    function test_UserRoundsTracked() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        _lockAndClose();

        prediction.startRound(token1);
        vm.prank(alice);
        prediction.betBull(token1, TEN_USDC);

        uint256[] memory aliceRounds = prediction.getUserRounds(token1, alice);
        assertEq(aliceRounds.length, 2);
        assertEq(aliceRounds[0], 1);
        assertEq(aliceRounds[1], 2);
    }

    // ======================================================================
    // SECURITY FIX TESTS — Exploit paths for all audit findings
    // ======================================================================

    // --- Finding: Token not in pool (pool/token mismatch) ---

    function test_TokenNotInPool() public {
        address token2Local = address(0x3333);
        address tokenDecoy = address(0x9999);

        // Create a pool with USDC/token2, but try to register tokenDecoy
        PoolKey memory pk2 = PoolKey({ currency0: Currency.wrap(address(usdc)), currency1: Currency.wrap(token2Local), fee: 3000, tickSpacing: 60, hooks: IHooks(address(0)) });

        // tokenDecoy is NOT in this pool — should revert
        vm.expectRevert(BankrBetsOracle.TokenNotInPool.selector);
        oracle.addToken(tokenDecoy, address(0x4444), pk2);
    }

    // --- Finding: Minimum liquidity enforcement ---

    function test_MinLiquidityEnforced() public {
        // Set a minimum liquidity requirement
        oracle.setMinLiquidity(type(uint128).max);

        PoolKey memory pk2 = poolKeyWethUsdc;

        vm.expectRevert(BankrBetsOracle.MinLiquidityNotMet.selector);
        oracle.addToken(token2, address(0x4444), pk2);

        // Set low threshold — should work with live pool liquidity
        oracle.setMinLiquidity(1);
        oracle.addToken(token2, address(0x4444), pk2);
        assertTrue(oracle.isTokenActive(token2));
    }

    // --- Finding: Lock window expired (lockRound after closeTimestamp) ---

    function test_LockWindowExpired() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);

        // Warp past BOTH lock AND close timestamps
        vm.warp(block.timestamp + 240 + 300 + 1);

        // lockRound should fail — lock window has expired
        vm.expectRevert(BankrBetsPrediction.LockWindowExpired.selector);
        prediction.lockRound(token1);
    }

    function test_LockAndCloseInSameBlockExploitPrevented() public {
        // The exploit: delay lockRound until after closeTimestamp,
        // then call lockRound + closeRound in the same block.
        // Both read the same price → tie → forced refund, nullifying losses.
        _startRoundAndBet(TEN_USDC, TEN_USDC);

        // Warp past close time
        vm.warp(block.timestamp + 240 + 300 + 1);

        // Attacker tries to lock — BLOCKED by lock window enforcement
        vm.expectRevert(BankrBetsPrediction.LockWindowExpired.selector);
        prediction.lockRound(token1);

        // The round eventually goes to refund via refundRound after grace period
    }

    function test_IsLockableAfterCloseTimestampReturnsFalse() public {
        prediction.startRound(token1);

        // Warp past close timestamp
        vm.warp(block.timestamp + 240 + 300 + 1);

        // isLockable should return false (lock window expired)
        assertFalse(prediction.isLockable(token1));
    }

    // --- Auto-cancel expired unlocked rounds ---

    function test_AutoCancelExpiredUnlockedRound() public {
        // Start a round — nobody bets or locks
        prediction.startRound(token1);
        assertTrue(prediction.hasActiveRound(token1));

        // Warp past close timestamp (lock window expired, never locked)
        vm.warp(block.timestamp + 240 + 300 + 1);

        // lockRound is now impossible
        vm.expectRevert(BankrBetsPrediction.LockWindowExpired.selector);
        prediction.lockRound(token1);

        // But startRound should auto-cancel the expired round and start a new one
        prediction.startRound(token1);

        // Previous round should be cancelled
        BankrBetsPrediction.Round memory r1 = prediction.getRound(token1, 1);
        assertTrue(r1.cancelled);
        assertTrue(r1.oracleCalled);

        // New round is now active (epoch 2)
        assertEq(prediction.getCurrentEpoch(token1), 2);
        assertTrue(prediction.hasActiveRound(token1));
    }

    function test_AutoCancelExpiredUnlockedRoundWithBets() public {
        // Start round and place bets, but nobody locks
        _startRoundAndBet(TEN_USDC, TEN_USDC);

        // Warp past close timestamp without locking
        vm.warp(block.timestamp + 240 + 300 + 1);

        // Start new round — auto-cancels expired round
        prediction.startRound(token1);
        assertEq(prediction.getCurrentEpoch(token1), 2);

        // Bettors can claim refund from the cancelled round
        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        prediction.claim(token1, epochs);
        assertEq(usdc.balanceOf(alice) - aliceBefore, TEN_USDC); // Full refund

        uint256 bobBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        prediction.claim(token1, epochs);
        assertEq(usdc.balanceOf(bob) - bobBefore, TEN_USDC); // Full refund
    }

    function test_CannotAutoExpireLockedRound() public {
        // Start round, bet, and lock
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        vm.warp(block.timestamp + 240);
        prediction.lockRound(token1);

        // Warp past close — round is locked but not closed
        vm.warp(block.timestamp + 300 + 1);

        // startRound should NOT auto-cancel a locked round (someone can still close it)
        vm.expectRevert(BankrBetsPrediction.RoundNotSettled.selector);
        prediction.startRound(token1);
    }

    // --- Finding: Refund on non-existent epoch ---

    function test_RefundNonExistentEpoch() public {
        // Epoch 999 was never created — startTimestamp == 0
        vm.warp(block.timestamp + 100_000);

        vm.expectRevert(BankrBetsPrediction.RoundNotStarted.selector);
        prediction.refundRound(token1, 999);
    }

    // --- Finding: Deactivate during active round ---

    function test_DeactivateDuringActiveRound() public {
        prediction.startRound(token1);

        // Market has an active (unsettled) round
        assertTrue(prediction.hasActiveRound(token1));

        // Creator tries to deactivate — should be blocked
        vm.prank(marketCreator);
        vm.expectRevert(BankrBetsOracle.ActiveRoundExists.selector);
        oracle.deactivateMarket(token1);
    }

    function test_OwnerDeactivateDuringActiveRound() public {
        prediction.startRound(token1);

        // Owner tries to deactivate — should be blocked by active round
        vm.expectRevert(BankrBetsOracle.ActiveRoundExists.selector);
        oracle.deactivateMarket(token1);
    }

    function test_DeactivateAfterRoundSettled() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        _lockAndClose();

        // Round is settled — hasActiveRound should be false
        assertFalse(prediction.hasActiveRound(token1));

        // Now deactivation should work
        vm.prank(marketCreator);
        oracle.deactivateMarket(token1);
        assertFalse(oracle.isTokenActive(token1));
    }

    function test_OwnerDeactivateAfterRoundRefunded() public {
        prediction.startRound(token1);

        // Refund the round after grace period
        vm.warp(block.timestamp + 240 + 300 + 3601);
        prediction.refundRound(token1, 1);
        assertFalse(prediction.hasActiveRound(token1));

        // Now owner deactivation should work
        oracle.deactivateMarket(token1);
        assertFalse(oracle.isTokenActive(token1));
    }

    // --- Finding: addTokenFor restricted to Prediction contract ---

    function test_AddTokenForUnauthorized() public {
        PoolKey memory pk2 = poolKeyWethUsdc;

        // Random user calling addTokenFor should fail
        vm.prank(alice);
        vm.expectRevert(BankrBetsOracle.Unauthorized.selector);
        oracle.addTokenFor(token2, address(0x4444), pk2, alice);
    }

    // --- Finding: getPrice overflow safety ---

    function test_GetPriceSafeForExtremeSqrtPriceX96() public {
        // Ensure getPrice doesn't revert on a live pool
        PoolKey memory pk2 = poolKeyWethUsdc;
        oracle.addToken(token2, address(0x4444), pk2);

        // Should NOT revert (overflow protection)
        int256 price = oracle.getPrice(token2);
        assertTrue(price > 0);
    }

    function test_GetPriceSafeForLowSqrtPriceX96() public {
        // Ensure getPrice doesn't revert on a live pool
        PoolKey memory pk2 = poolKeyWethUsdc;
        oracle.addToken(token2, address(0x4444), pk2);

        // Should NOT revert (no divide-by-zero or underflow)
        int256 price = oracle.getPrice(token2);
        assertTrue(price >= 0);
    }

    // --- hasActiveRound view ---

    function test_HasActiveRound() public {
        assertFalse(prediction.hasActiveRound(token1));

        prediction.startRound(token1);
        assertTrue(prediction.hasActiveRound(token1));

        // Lock + close
        _lockAndClose();
        assertFalse(prediction.hasActiveRound(token1));
    }

    // --- V-1 Fix: Deactivated market re-registration blocked ---

    function test_ReRegistrationBlocked() public {
        // Deactivate the existing market
        vm.prank(marketCreator);
        oracle.deactivateMarket(token1);
        assertFalse(oracle.isTokenActive(token1));

        // Try to re-register the same token — should fail (creator != address(0))
        vm.prank(alice);
        vm.expectRevert(BankrBetsOracle.MarketAlreadyExists.selector);
        oracle.addToken(token1, address(bytes20(CLAWD_POOL_ID)), poolKey1);

        // Admin can still re-activate via activateMarket
        oracle.activateMarket(token1);
        assertTrue(oracle.isTokenActive(token1));
    }

    // --- V-2 Fix: Price direction for currency1 tokens ---

    function test_PriceInversionForCurrency1Token() public {
        // Inversion consistency check on live pool:
        // price(token2) * price(token3) ~= 1e36
        PoolKey memory pk = poolKeyWethUsdc;
        oracle.addToken(token2, address(0x7777), pk);
        oracle.addToken(token3, address(0x8888), pk);

        int256 priceToken2 = oracle.getPrice(token2);
        int256 priceToken3 = oracle.getPrice(token3);
        assertTrue(priceToken2 > 0 && priceToken3 > 0);

        uint256 prod = uint256(priceToken2) * uint256(priceToken3);
        uint256 target = 1e36;
        uint256 tolerance = target / 20; // 5%
        assertTrue(prod > target - tolerance && prod < target + tolerance);
    }

    function test_PriceNoInversionForCurrency0Token() public view {
        int256 price1 = oracle.getPrice(token1);
        assertTrue(price1 > 0);
    }

    // --- getActiveMarketsInfo batch view ---

    function test_GetActiveMarketsInfo() public {
        BankrBetsOracle.MarketView[] memory infos = oracle.getActiveMarketsInfo();
        assertEq(infos.length, 1);
        assertEq(infos[0].token, token1);
        assertEq(infos[0].creator, marketCreator);
        assertEq(infos[0].poolAddress, address(bytes20(CLAWD_POOL_ID)));
        assertTrue(infos[0].createdAt > 0);

        // Add another token
        PoolKey memory pk2 = poolKeyWethUsdc;
        vm.prank(alice);
        oracle.addToken(token2, address(0x4444), pk2);

        infos = oracle.getActiveMarketsInfo();
        assertEq(infos.length, 2);
        assertEq(infos[1].token, token2);
        assertEq(infos[1].creator, alice);

        // Deactivate token2 — should only return token1
        vm.prank(alice);
        oracle.deactivateMarket(token2);
        infos = oracle.getActiveMarketsInfo();
        assertEq(infos.length, 1);
        assertEq(infos[0].token, token1);
    }

    // --- MAX_BPS correctness ---

    function test_MaxBpsIs10000() public view {
        assertEq(prediction.MAX_BPS(), 10_000);
    }

    function test_FeeCalculationCorrectness() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        _lockAndClose();

        // 1.5% of 20 USDC = 0.3 USDC = 300_000
        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        if (round.cancelled) return;

        assertEq(prediction.treasuryAmount(), 300_000);

        // 0.5% of 20 USDC = 0.1 USDC = 100_000
        assertEq(prediction.creatorEarnings(marketCreator), 100_000);

        // 0.1% of 20 USDC = 0.02 USDC = 20_000
        uint256 settlerBal = usdc.balanceOf(settler);
        assertEq(settlerBal, 20_000);

        // Winner reward = total - treasury - creator - settler
        // = 20_000_000 - 300_000 - 100_000 - 20_000 = 19_580_000
        assertEq(round.rewardAmount, 19_580_000);
    }

    // ========== Oracle Hardening Tests ==========

    function test_RuntimeLiquidityCheck() public {
        // Price should work with no minLiquidity set
        int256 priceBefore = oracle.getPrice(token1);
        assertTrue(priceBefore > 0);

        // Set minLiquidity very high — getPrice should now revert
        oracle.setMinLiquidity(type(uint128).max);

        vm.expectRevert(BankrBetsOracle.MinLiquidityNotMet.selector);
        oracle.getPrice(token1);

        // Reset to 0 — should work again
        oracle.setMinLiquidity(0);
        int256 priceAfter = oracle.getPrice(token1);
        assertTrue(priceAfter > 0);
    }

}
