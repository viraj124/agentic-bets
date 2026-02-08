// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../contracts/BankrBetsOracle.sol";
import "../contracts/BankrBetsPrediction.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId, PoolIdLibrary } from "@uniswap/v4-core/src/types/PoolId.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";

/// @dev Mock USDC with 6 decimals
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Mock PoolManager — stores sqrtPriceX96 and liquidity per PoolId for testing V4 price reads.
///      StateLibrary.getSlot0() calls extsload on the manager, so we compute the exact
///      storage slot and return packed slot0 data (sqrtPriceX96 in bottom 160 bits).
///      StateLibrary.getLiquidity() reads at stateSlot + 3 (LIQUIDITY_OFFSET).
contract MockPoolManager {
    bytes32 public constant POOLS_SLOT = bytes32(uint256(6));
    uint256 public constant LIQUIDITY_OFFSET = 3;

    mapping(bytes32 => bytes32) public slots;

    function setPrice(PoolId poolId, uint160 sqrtPriceX96) external {
        bytes32 stateSlot = keccak256(abi.encodePacked(PoolId.unwrap(poolId), POOLS_SLOT));
        slots[stateSlot] = bytes32(uint256(sqrtPriceX96));
    }

    function setLiquidity(PoolId poolId, uint128 liquidity) external {
        bytes32 stateSlot = keccak256(abi.encodePacked(PoolId.unwrap(poolId), POOLS_SLOT));
        bytes32 liquiditySlot = bytes32(uint256(stateSlot) + LIQUIDITY_OFFSET);
        slots[liquiditySlot] = bytes32(uint256(liquidity));
    }

    function extsload(bytes32 slot) external view returns (bytes32) {
        return slots[slot];
    }
}

contract BankrBetsTest is Test {
    BankrBetsOracle public oracle;
    BankrBetsPrediction public prediction;
    MockUSDC public usdc;
    MockPoolManager public mockPM;

    address public owner = address(this);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public carol = address(0xCA401);
    address public marketCreator = address(0xCEE8);
    address public settler = address(0x5E77);

    address public token1 = address(0x1111);
    address public pool1 = address(0x2222);

    uint256 public constant ONE_USDC = 1_000_000;
    uint256 public constant TEN_USDC = 10_000_000;
    uint256 public constant HUNDRED_USDC = 100_000_000;

    // sqrtPriceX96 values — price = (sqrtPriceX96 / 2^96)^2 * 1e18
    uint160 public constant SQRT_PRICE_1_0 = 79_228_162_514_264_337_593_543_950_336; // 2^96 → price = 1.0e18
    uint160 public constant SQRT_PRICE_UP = 87_150_978_765_690_771_352_898_345_370; // 1.1 * 2^96 → price ≈ 1.21e18
    uint160 public constant SQRT_PRICE_DOWN = 71_305_346_262_837_903_834_189_555_302; // 0.9 * 2^96 → price ≈ 0.81e18

    PoolKey public poolKey1;
    PoolId public poolId1;

    function setUp() public {
        usdc = new MockUSDC();
        mockPM = new MockPoolManager();
        oracle = new BankrBetsOracle(address(mockPM));
        prediction = new BankrBetsPrediction(address(usdc), address(oracle));

        // Link oracle → prediction (required for addTokenFor + active round checks)
        oracle.setPredictionContract(address(prediction));

        // Build PoolKey for token1 — token1 must be one of the currencies
        poolKey1 = PoolKey({ currency0: Currency.wrap(address(usdc)), currency1: Currency.wrap(token1), fee: 3000, tickSpacing: 60, hooks: IHooks(address(0)) });
        poolId1 = poolKey1.toId();

        // Set initial price + liquidity in mock (non-zero = pool is initialized)
        mockPM.setPrice(poolId1, SQRT_PRICE_1_0);
        mockPM.setLiquidity(poolId1, 1e18);

        // Register token via permissionless Oracle (marketCreator is first registrant)
        vm.prank(marketCreator);
        oracle.addToken(token1, pool1, poolKey1);

        // Mint USDC to users
        usdc.mint(alice, 1000 * ONE_USDC);
        usdc.mint(bob, 1000 * ONE_USDC);
        usdc.mint(carol, 1000 * ONE_USDC);

        // Approve prediction contract
        vm.prank(alice);
        usdc.approve(address(prediction), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(prediction), type(uint256).max);
        vm.prank(carol);
        usdc.approve(address(prediction), type(uint256).max);
    }

    // --- Helpers ---

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

    function _lockAndClose(uint160 lockSqrtPrice, uint160 closeSqrtPrice) internal {
        mockPM.setPrice(poolId1, lockSqrtPrice);
        vm.warp(block.timestamp + 240);
        vm.prank(settler);
        prediction.lockRound(token1);

        mockPM.setPrice(poolId1, closeSqrtPrice);
        vm.warp(block.timestamp + 300);
        vm.prank(settler);
        prediction.closeRound(token1);
    }

    // ========== Oracle Tests ==========

    function test_OracleSetup() public view {
        assertTrue(oracle.isTokenActive(token1));
        assertEq(oracle.getMaxBetAmount(token1), 500_000_000); // default 500 USDC
        assertEq(oracle.getMarketCreator(token1), marketCreator);
    }

    function test_PermissionlessAddToken() public {
        address token2 = address(0x3333);
        PoolKey memory pk2 = PoolKey({ currency0: Currency.wrap(address(usdc)), currency1: Currency.wrap(token2), fee: 3000, tickSpacing: 60, hooks: IHooks(address(0)) });
        mockPM.setPrice(pk2.toId(), SQRT_PRICE_1_0);
        mockPM.setLiquidity(pk2.toId(), 1e18);

        // Alice (random user) can register a market
        vm.prank(alice);
        oracle.addToken(token2, address(0x4444), pk2);
        assertTrue(oracle.isTokenActive(token2));
        assertEq(oracle.getMarketCreator(token2), alice);
        assertEq(oracle.getTokenCount(), 2);
    }

    function test_AddTokenDuplicate() public {
        vm.expectRevert(BankrBetsOracle.MarketAlreadyExists.selector);
        oracle.addToken(token1, pool1, poolKey1);
    }

    function test_AddTokenPoolNotInitialized() public {
        address token2 = address(0x3333);
        PoolKey memory pk2 = PoolKey({ currency0: Currency.wrap(address(usdc)), currency1: Currency.wrap(token2), fee: 3000, tickSpacing: 60, hooks: IHooks(address(0)) });
        // sqrtPriceX96 defaults to 0 → pool not initialized
        vm.expectRevert(BankrBetsOracle.PoolNotInitialized.selector);
        oracle.addToken(token2, address(0x4444), pk2);
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
        // sqrtPriceX96 = 2^96 → price = 1.0e18
        assertEq(price, 1e18);
    }

    function test_GetPriceAfterChange() public {
        mockPM.setPrice(poolId1, SQRT_PRICE_UP);
        int256 price = oracle.getPrice(token1);
        // 1.1^2 = 1.21 → price ≈ 1.21e18
        assertTrue(price > 1e18);
    }

    function test_GetActiveTokens() public {
        address token2 = address(0x3333);
        address token3 = address(0x4444);

        PoolKey memory pk2 = PoolKey({ currency0: Currency.wrap(address(usdc)), currency1: Currency.wrap(token2), fee: 3000, tickSpacing: 60, hooks: IHooks(address(0)) });
        PoolKey memory pk3 = PoolKey({ currency0: Currency.wrap(address(usdc)), currency1: Currency.wrap(token3), fee: 3000, tickSpacing: 60, hooks: IHooks(address(0)) });

        mockPM.setPrice(pk2.toId(), SQRT_PRICE_1_0);
        mockPM.setPrice(pk3.toId(), SQRT_PRICE_1_0);
        mockPM.setLiquidity(pk2.toId(), 1e18);
        mockPM.setLiquidity(pk3.toId(), 1e18);

        oracle.addToken(token2, address(0x5555), pk2);
        oracle.addToken(token3, address(0x6666), pk3);

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

        // Cancel the round first so deactivation is allowed
        prediction.cancelRound(token1, 1);

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

        mockPM.setPrice(poolId1, SQRT_PRICE_1_0);
        vm.warp(block.timestamp + 240);

        // Anyone can lock
        vm.prank(settler);
        prediction.lockRound(token1);

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertTrue(round.locked);
        assertEq(round.lockPrice, 1e18);
    }

    function test_LockRoundTooEarly() public {
        prediction.startRound(token1);
        vm.expectRevert(BankrBetsPrediction.RoundNotLockable.selector);
        prediction.lockRound(token1);
    }

    function test_LockRoundAlreadyLocked() public {
        prediction.startRound(token1);
        mockPM.setPrice(poolId1, SQRT_PRICE_1_0);
        vm.warp(block.timestamp + 240);
        prediction.lockRound(token1);

        vm.expectRevert(BankrBetsPrediction.RoundAlreadyLocked.selector);
        prediction.lockRound(token1);
    }

    function test_CloseRound() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        _lockAndClose(SQRT_PRICE_1_0, SQRT_PRICE_UP);

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertTrue(round.oracleCalled);
        assertTrue(round.closePrice > round.lockPrice);
        assertEq(round.rewardBaseCalAmount, TEN_USDC); // Bulls won
    }

    function test_CloseRoundTooEarly() public {
        prediction.startRound(token1);
        mockPM.setPrice(poolId1, SQRT_PRICE_1_0);
        vm.warp(block.timestamp + 240);
        prediction.lockRound(token1);

        // Don't warp to close time
        vm.expectRevert(BankrBetsPrediction.RoundNotClosable.selector);
        prediction.closeRound(token1);
    }

    function test_AnyoneCanLockAndClose() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);

        // Alice (bettor) can lock
        mockPM.setPrice(poolId1, SQRT_PRICE_1_0);
        vm.warp(block.timestamp + 240);
        vm.prank(alice);
        prediction.lockRound(token1);

        // Bob (another bettor) can close
        mockPM.setPrice(poolId1, SQRT_PRICE_UP);
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

        _lockAndClose(SQRT_PRICE_1_0, SQRT_PRICE_UP);

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
        _lockAndClose(SQRT_PRICE_1_0, SQRT_PRICE_DOWN);

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
        _lockAndClose(SQRT_PRICE_1_0, SQRT_PRICE_UP);

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
        _lockAndClose(SQRT_PRICE_1_0, SQRT_PRICE_1_0); // Same price = tie

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertTrue(round.cancelled);

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

        _lockAndClose(SQRT_PRICE_1_0, SQRT_PRICE_UP); // Bulls win

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
        address token2 = address(0x3333);
        PoolKey memory pk2 = PoolKey({ currency0: Currency.wrap(address(usdc)), currency1: Currency.wrap(token2), fee: 3000, tickSpacing: 60, hooks: IHooks(address(0)) });
        mockPM.setPrice(pk2.toId(), SQRT_PRICE_1_0);
        mockPM.setLiquidity(pk2.toId(), 1e18);

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
        _lockAndClose(SQRT_PRICE_1_0, SQRT_PRICE_UP);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;

        vm.prank(alice);
        prediction.claim(token1, epochs);

        vm.prank(alice);
        vm.expectRevert(BankrBetsPrediction.AlreadyClaimed.selector);
        prediction.claim(token1, epochs);
    }

    function test_ClaimNoBet() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        _lockAndClose(SQRT_PRICE_1_0, SQRT_PRICE_UP);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;

        vm.prank(carol); // Carol never bet
        vm.expectRevert(BankrBetsPrediction.NoBetPlaced.selector);
        prediction.claim(token1, epochs);
    }

    function test_Claimable() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);

        assertFalse(prediction.claimable(token1, 1, alice));

        _lockAndClose(SQRT_PRICE_1_0, SQRT_PRICE_UP);

        assertTrue(prediction.claimable(token1, 1, alice)); // bull won
        assertFalse(prediction.claimable(token1, 1, bob)); // bear lost
    }

    // ========== Cancel Round ==========

    function test_CancelRound() public {
        prediction.startRound(token1);
        vm.prank(alice);
        prediction.betBull(token1, TEN_USDC);

        prediction.cancelRound(token1, 1);

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertTrue(round.cancelled);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;
        uint256 bal = usdc.balanceOf(alice);
        vm.prank(alice);
        prediction.claim(token1, epochs);
        assertEq(usdc.balanceOf(alice) - bal, TEN_USDC);
    }

    function test_CancelRoundOnlyOwner() public {
        prediction.startRound(token1);

        vm.prank(alice);
        vm.expectRevert();
        prediction.cancelRound(token1, 1);
    }

    // ========== Admin Tests ==========

    function test_ClaimTreasury() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        _lockAndClose(SQRT_PRICE_1_0, SQRT_PRICE_UP);

        uint256 totalPool = 2 * TEN_USDC;
        uint256 expectedTreasury = (totalPool * 150) / 10_000; // 1.5%

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

        mockPM.setPrice(poolId1, SQRT_PRICE_1_0);
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
        mockPM.setPrice(poolId1, SQRT_PRICE_1_0);
        vm.warp(block.timestamp + 240);
        vm.prank(settler);
        prediction.lockRound(token1);

        // Close — price went UP
        mockPM.setPrice(poolId1, SQRT_PRICE_UP);
        vm.warp(block.timestamp + 300);
        vm.prank(settler);
        prediction.closeRound(token1);

        // Can start next round
        prediction.startRound(token1);
        assertEq(prediction.getCurrentEpoch(token1), 2);

        // Claim round 1 winnings
        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;
        vm.prank(alice);
        prediction.claim(token1, epochs);

        // Alice should have gotten most of the pool back
        assertTrue(usdc.balanceOf(alice) > 940 * ONE_USDC);
    }

    // ========== Fuzz Tests ==========

    function testFuzz_PayoutNeverExceedsPool(uint256 bullBet, uint256 bearBet) public {
        bullBet = bound(bullBet, ONE_USDC, 50 * ONE_USDC);
        bearBet = bound(bearBet, ONE_USDC, 50 * ONE_USDC);

        _startRoundAndBet(bullBet, bearBet);
        _lockAndClose(SQRT_PRICE_1_0, SQRT_PRICE_UP);

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        uint256 totalPool = bullBet + bearBet;

        assertTrue(round.rewardAmount <= totalPool);

        uint256 treasuryFee = (totalPool * 150) / 10_000;
        uint256 creatorFee = (totalPool * 50) / 10_000;
        uint256 settlerFee = (totalPool * 10) / 10_000;
        assertEq(round.rewardAmount, totalPool - treasuryFee - creatorFee - settlerFee);
    }

    function testFuzz_NoRemainingTokensAfterClaim(uint256 amount) public {
        amount = bound(amount, ONE_USDC, 50 * ONE_USDC);

        _startRoundAndBet(amount, amount);
        _lockAndClose(SQRT_PRICE_1_0, SQRT_PRICE_UP);

        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;

        // Winner claims
        vm.prank(alice);
        prediction.claim(token1, epochs);

        // Treasury claims
        prediction.claimTreasury();

        // Contract should have 0 remaining
        assertEq(usdc.balanceOf(address(prediction)), 0);
    }

    // ========== User Rounds Tracking ==========

    function test_UserRoundsTracked() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        _lockAndClose(SQRT_PRICE_1_0, SQRT_PRICE_UP);

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
        address token2 = address(0x3333);
        address tokenDecoy = address(0x9999);

        // Create a pool with USDC/token2, but try to register tokenDecoy
        PoolKey memory pk2 = PoolKey({ currency0: Currency.wrap(address(usdc)), currency1: Currency.wrap(token2), fee: 3000, tickSpacing: 60, hooks: IHooks(address(0)) });
        mockPM.setPrice(pk2.toId(), SQRT_PRICE_1_0);
        mockPM.setLiquidity(pk2.toId(), 1e18);

        // tokenDecoy is NOT in this pool — should revert
        vm.expectRevert(BankrBetsOracle.TokenNotInPool.selector);
        oracle.addToken(tokenDecoy, address(0x4444), pk2);
    }

    // --- Finding: Minimum liquidity enforcement ---

    function test_MinLiquidityEnforced() public {
        // Set a minimum liquidity requirement
        oracle.setMinLiquidity(1e18);

        address token2 = address(0x3333);
        PoolKey memory pk2 = PoolKey({ currency0: Currency.wrap(address(usdc)), currency1: Currency.wrap(token2), fee: 3000, tickSpacing: 60, hooks: IHooks(address(0)) });
        mockPM.setPrice(pk2.toId(), SQRT_PRICE_1_0);
        // Set low liquidity below threshold
        mockPM.setLiquidity(pk2.toId(), 1e17);

        vm.expectRevert(BankrBetsOracle.MinLiquidityNotMet.selector);
        oracle.addToken(token2, address(0x4444), pk2);

        // Set sufficient liquidity — should work
        mockPM.setLiquidity(pk2.toId(), 1e18);
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
        _lockAndClose(SQRT_PRICE_1_0, SQRT_PRICE_UP);

        // Round is settled — hasActiveRound should be false
        assertFalse(prediction.hasActiveRound(token1));

        // Now deactivation should work
        vm.prank(marketCreator);
        oracle.deactivateMarket(token1);
        assertFalse(oracle.isTokenActive(token1));
    }

    function test_OwnerDeactivateAfterRoundCancelled() public {
        prediction.startRound(token1);

        // Cancel the active round
        prediction.cancelRound(token1, 1);
        assertFalse(prediction.hasActiveRound(token1));

        // Now owner deactivation should work
        oracle.deactivateMarket(token1);
        assertFalse(oracle.isTokenActive(token1));
    }

    // --- Finding: addTokenFor restricted to Prediction contract ---

    function test_AddTokenForUnauthorized() public {
        address token2 = address(0x3333);
        PoolKey memory pk2 = PoolKey({ currency0: Currency.wrap(address(usdc)), currency1: Currency.wrap(token2), fee: 3000, tickSpacing: 60, hooks: IHooks(address(0)) });
        mockPM.setPrice(pk2.toId(), SQRT_PRICE_1_0);
        mockPM.setLiquidity(pk2.toId(), 1e18);

        // Random user calling addTokenFor should fail
        vm.prank(alice);
        vm.expectRevert(BankrBetsOracle.Unauthorized.selector);
        oracle.addTokenFor(token2, address(0x4444), pk2, alice);
    }

    // --- Finding: getPrice overflow safety ---

    function test_GetPriceSafeForExtremeSqrtPriceX96() public {
        // Max possible sqrtPriceX96 per Uniswap: MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342
        // This is close to 2^160. Using the old formula (sqrtPriceX96 * sqrtPriceX96) would overflow.
        // The two-step FullMath approach should handle it safely.
        uint160 highPrice = 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342;

        address token2 = address(0x3333);
        PoolKey memory pk2 = PoolKey({ currency0: Currency.wrap(address(usdc)), currency1: Currency.wrap(token2), fee: 3000, tickSpacing: 60, hooks: IHooks(address(0)) });
        PoolId pid2 = pk2.toId();
        mockPM.setPrice(pid2, highPrice);
        mockPM.setLiquidity(pid2, 1e18);
        oracle.addToken(token2, address(0x4444), pk2);

        // Should NOT revert (overflow protection)
        int256 price = oracle.getPrice(token2);
        assertTrue(price > 0);
    }

    function test_GetPriceSafeForLowSqrtPriceX96() public {
        // Very low sqrtPriceX96 (near minimum)
        uint160 lowPrice = 4_295_128_739 + 1; // Just above MIN_SQRT_PRICE

        address token2 = address(0x3333);
        PoolKey memory pk2 = PoolKey({ currency0: Currency.wrap(address(usdc)), currency1: Currency.wrap(token2), fee: 3000, tickSpacing: 60, hooks: IHooks(address(0)) });
        PoolId pid2 = pk2.toId();
        mockPM.setPrice(pid2, lowPrice);
        mockPM.setLiquidity(pid2, 1e18);
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
        _lockAndClose(SQRT_PRICE_1_0, SQRT_PRICE_UP);
        assertFalse(prediction.hasActiveRound(token1));
    }

    // --- MAX_BPS correctness ---

    function test_MaxBpsIs10000() public view {
        assertEq(prediction.MAX_BPS(), 10_000);
    }

    function test_FeeCalculationCorrectness() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        _lockAndClose(SQRT_PRICE_1_0, SQRT_PRICE_UP);

        uint256 totalPool = 2 * TEN_USDC; // 20_000_000

        // 1.5% of 20 USDC = 0.3 USDC = 300_000
        assertEq(prediction.treasuryAmount(), 300_000);

        // 0.5% of 20 USDC = 0.1 USDC = 100_000
        assertEq(prediction.creatorEarnings(marketCreator), 100_000);

        // 0.1% of 20 USDC = 0.02 USDC = 20_000
        uint256 settlerBal = usdc.balanceOf(settler);
        assertEq(settlerBal, 20_000);

        // Winner reward = total - treasury - creator - settler
        // = 20_000_000 - 300_000 - 100_000 - 20_000 = 19_580_000
        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertEq(round.rewardAmount, 19_580_000);
    }
}
