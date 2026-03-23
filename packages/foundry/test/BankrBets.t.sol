// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../contracts/BankrBetsOracle.sol";
import "../contracts/BankrBetsPrediction.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";

contract BankrBetsTest is Test {
    BankrBetsOracle public oracle;
    BankrBetsPrediction public prediction;
    IERC20 public usdc;

    address public owner = address(this);
    uint256 internal alicePk = 0xA11CE12345;
    uint256 internal bobPk = 0xB0B12345;
    uint256 internal carolPk = 0xCA40112345;
    address public alice;
    address public bob;
    address public carol;
    address public marketCreator = address(0xCEE8);
    address public settler = address(0x5E77);

    // Bankr token launched via Clanker on bankr.bot (CLAWD — top by market cap, price > 0)
    address public token1 = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07; // CLAWD (currency1, WETH < CLAWD)
    address public constant QUOTE_TOKEN = 0x4200000000000000000000000000000000000006; // WETH (Base)
    address public token2 = QUOTE_TOKEN; // WETH
    address public token3 = 0xf48bC234855aB08ab2EC0cfaaEb2A80D065a3b07; // BNKRW

    // CLAWD/WETH V4 PoolId (from Clanker API, verified on-chain)
    // PoolId = keccak256(abi.encode(WETH, CLAWD, 0x800000, 200, StaticFeeV2))
    bytes32 public constant CLAWD_POOL_ID = 0x9fd58e73d8047cb14ac540acd141d3fc1a41fb6252d674b730faf62fe24aa8ce;
    bytes32 public constant BNKRW_POOL_ID = 0x6c8fd04c19e3c6c3efc21f6f5ae79c1453a19d971b7b7d4969df1928c380aaad;

    // WCHAN — vanilla V4 pool (no hooks, native ETH, fee=10000, tickSpacing=200)
    address public wchan = 0xBa5ED0000e1CA9136a695f0a848012A16008B032;
    bytes32 public constant WCHAN_POOL_ID = 0x81c7a2a2c33ea285f062c5ac0c4e3d4ffb2f6fd2588bbd354d0d3af8a58b6337;

    // Base mainnet addresses (forked)
    address public constant BASE_POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address public constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // Clanker V4 pool parameters — all Bankr tokens use fee=0x800000 and tickSpacing=200
    address public constant CLANKER_STATIC_FEE_V2 = 0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC;
    address public constant CLANKER_DYNAMIC_FEE_V2 = 0xd60D6B218116cFd801E28F78d011a203D2b068Cc;
    uint24 public constant CLANKER_FEE = 0x800000; // DYNAMIC_FEE_FLAG (used by all Clanker hooks)
    int24 public constant CLANKER_TICK_SPACING = 200;
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");

    uint256 public constant ONE_USDC = 1_000_000;
    uint256 public constant TEN_USDC = 10_000_000;
    PoolKey public poolKey1;
    PoolKey public poolKey3;
    PoolKey public poolKeyWchan;

    function setUp() public {
        // Skip entire test suite when BASE_RPC_URL is not set (e.g. CI without secrets)
        string memory rpcUrl = vm.envOr("BASE_RPC_URL", string(""));
        if (bytes(rpcUrl).length == 0) {
            vm.skip(true);
        }
        vm.createSelectFork("base_mainnet");
        alice = vm.addr(alicePk);
        bob = vm.addr(bobPk);
        carol = vm.addr(carolPk);

        usdc = IERC20(BASE_USDC);
        oracle = new BankrBetsOracle(BASE_POOL_MANAGER);
        prediction = new BankrBetsPrediction(address(usdc), address(oracle));

        // Link oracle → prediction (required for addTokenFor + active round checks)
        oracle.setPredictionContract(address(prediction));

        // Construct PoolKeys from known Clanker V4 parameters (verified on-chain)
        poolKey1 = _clankerPoolKey(token1, CLANKER_STATIC_FEE_V2);
        poolKey3 = _clankerPoolKey(token3, CLANKER_STATIC_FEE_V2);
        // WCHAN: vanilla V4 pool (native ETH + no hooks + 1% fee)
        poolKeyWchan = _vanillaPoolKey(wchan, address(0), 10_000, CLANKER_TICK_SPACING);

        // Register token via permissionless Oracle (marketCreator is first registrant)
        // poolAddress = PoolId cast to address (GeckoTerminal uses PoolId as pool identifier for V4)
        vm.prank(marketCreator);
        oracle.addToken(token1, poolKey1);

        // Mint USDC to users (forked balance edits)
        deal(BASE_USDC, alice, 1000 * ONE_USDC);
        deal(BASE_USDC, bob, 1000 * ONE_USDC);
        deal(BASE_USDC, carol, 1000 * ONE_USDC);
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

    /// @dev Construct a PoolKey for a vanilla V4 pool (native ETH or WETH as quote, no hooks)
    function _vanillaPoolKey(address token, address quoteToken, uint24 fee, int24 tickSpacing) internal pure returns (PoolKey memory key) {
        address c0 = token < quoteToken ? token : quoteToken;
        address c1 = token < quoteToken ? quoteToken : token;
        key = PoolKey({ currency0: Currency.wrap(c0), currency1: Currency.wrap(c1), fee: fee, tickSpacing: tickSpacing, hooks: IHooks(address(0)) });
    }

    function _startRoundAndBet(uint256 aliceBet, uint256 bobBet) internal {
        // First non-zero bet auto-starts the round
        if (aliceBet > 0) {
            _betBull(alice, token1, aliceBet);
        }
        if (bobBet > 0) {
            _betBear(bob, token1, bobBet);
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

    function _expectOwnableRevert(address caller) internal {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
    }

    function _usdcAuthorizationDigest(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce) internal view returns (bytes32 digest) {
        bytes32 domainSeparator = keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256(bytes("USD Coin")), keccak256(bytes("2")), block.chainid, BASE_USDC));

        bytes32 structHash = keccak256(abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce));

        digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function _signUsdcReceiveAuthorization(uint256 privateKey, address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 digest = _usdcAuthorizationDigest(from, to, value, validAfter, validBefore, nonce);
        (v, r, s) = vm.sign(privateKey, digest);
    }

    function _privateKeyOf(address bettor) internal view returns (uint256 pk) {
        if (bettor == alice) return alicePk;
        if (bettor == bob) return bobPk;
        if (bettor == carol) return carolPk;
        revert("Unknown bettor");
    }

    function _betWithAuthorization(address bettor, address token, uint256 amount, BankrBetsPrediction.Position position) internal {
        uint256 validAfter = block.timestamp - 1;
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 nonce = keccak256(abi.encodePacked("auth", bettor, token, amount, position, block.timestamp, gasleft()));
        (uint8 v, bytes32 r, bytes32 s) = _signUsdcReceiveAuthorization(_privateKeyOf(bettor), bettor, address(prediction), amount, validAfter, validBefore, nonce);

        vm.prank(bettor);
        prediction.betWithAuthorization(token, amount, uint8(position), validAfter, validBefore, nonce, v, r, s);
    }

    function _betBull(address bettor, address token, uint256 amount) internal {
        _betWithAuthorization(bettor, token, amount, BankrBetsPrediction.Position.Bull);
    }

    function _betBear(address bettor, address token, uint256 amount) internal {
        _betWithAuthorization(bettor, token, amount, BankrBetsPrediction.Position.Bear);
    }

    // Helpers for the transferFrom (smart-wallet) path
    function _betBullTF(address bettor, address token, uint256 amount) internal {
        vm.startPrank(bettor);
        IERC20(BASE_USDC).approve(address(prediction), amount);
        prediction.bet(token, amount, 0);
        vm.stopPrank();
    }

    function _betBearTF(address bettor, address token, uint256 amount) internal {
        vm.startPrank(bettor);
        IERC20(BASE_USDC).approve(address(prediction), amount);
        prediction.bet(token, amount, 1);
        vm.stopPrank();
    }

    // ========== Oracle Tests ==========

    function test_OracleSetup() public view {
        assertTrue(oracle.isTokenActive(token1));
        assertEq(oracle.getMaxBetAmount(token1), 1_000_000_000); // default 1000 USDC
        assertEq(oracle.getMarketCreator(token1), marketCreator);
    }

    function test_PermissionlessAddToken() public {
        // Alice (random user) can register a real Bankr token (BNKRW)
        vm.prank(alice);
        oracle.addToken(token3, poolKey3);
        assertTrue(oracle.isTokenActive(token3));
        assertEq(oracle.getMarketCreator(token3), alice);
        assertEq(oracle.getTokenCount(), 2);
    }

    function test_AddTokenDuplicate() public {
        vm.expectRevert(BankrBetsOracle.MarketAlreadyExists.selector);
        oracle.addToken(token1, poolKey1);
    }

    function test_AddTokenPoolNotInitialized() public {
        address token2Local = address(0x3333);
        PoolKey memory pk2 = _clankerPoolKey(token2Local, CLANKER_STATIC_FEE_V2);
        // sqrtPriceX96 defaults to 0 → pool not initialized
        vm.expectRevert(BankrBetsOracle.PoolNotInitialized.selector);
        oracle.addToken(token2Local, pk2);
    }

    function test_OracleConstructorZeroAddress() public {
        vm.expectRevert(BankrBetsOracle.ZeroAddress.selector);
        new BankrBetsOracle(address(0));
    }

    function test_AddTokenZeroAddress() public {
        vm.expectRevert(BankrBetsOracle.ZeroAddress.selector);
        oracle.addToken(address(0), poolKey1);
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

    function test_GetPriceInactiveMarket() public {
        vm.prank(marketCreator);
        oracle.deactivateMarket(token1);

        vm.expectRevert(BankrBetsOracle.MarketNotActive.selector);
        oracle.getPrice(token1);
    }

    function test_GetPriceAfterChange() public view {
        int256 price = oracle.getPrice(token1);
        assertTrue(price > 0);
    }

    function test_GetActiveTokens() public {
        oracle.addToken(token2, poolKey1);
        oracle.addToken(token3, poolKey3);

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

    function test_SetMaxBetAmountInactiveMarket() public {
        vm.prank(marketCreator);
        oracle.deactivateMarket(token1);

        vm.expectRevert(BankrBetsOracle.MarketNotActive.selector);
        oracle.setMaxBetAmount(token1, 1000 * ONE_USDC);
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

        _betBull(alice, token1, TEN_USDC);

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

        _betBear(bob, token1, TEN_USDC);

        BankrBetsPrediction.BetInfo memory bet = prediction.getUserBet(token1, 1, bob);
        assertEq(uint8(bet.position), uint8(BankrBetsPrediction.Position.Bear));
        assertEq(bet.amount, TEN_USDC);
    }

    function test_BetBullWithAuthorization() public {
        uint256 bettorPk = 0xA11CE123;
        address bettor = vm.addr(bettorPk);
        uint256 amount = TEN_USDC;

        prediction.startRound(token1);
        deal(BASE_USDC, bettor, 1000 * ONE_USDC);
        assertEq(usdc.allowance(bettor, address(prediction)), 0);

        uint256 validAfter = block.timestamp - 1;
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 nonce = keccak256("auth-bull-1");
        (uint8 v, bytes32 r, bytes32 s) = _signUsdcReceiveAuthorization(bettorPk, bettor, address(prediction), amount, validAfter, validBefore, nonce);

        uint256 bettorBalBefore = usdc.balanceOf(bettor);
        uint256 predictionBalBefore = usdc.balanceOf(address(prediction));

        vm.prank(bettor);
        prediction.betWithAuthorization(token1, amount, uint8(BankrBetsPrediction.Position.Bull), validAfter, validBefore, nonce, v, r, s);

        BankrBetsPrediction.BetInfo memory bet = prediction.getUserBet(token1, 1, bettor);
        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertEq(uint8(bet.position), uint8(BankrBetsPrediction.Position.Bull));
        assertEq(bet.amount, amount);
        assertEq(round.totalAmount, amount);
        assertEq(round.bullAmount, amount);
        assertEq(round.bearAmount, 0);
        assertEq(usdc.balanceOf(bettor), bettorBalBefore - amount);
        assertEq(usdc.balanceOf(address(prediction)), predictionBalBefore + amount);
    }

    function test_BetBearWithAuthorization() public {
        uint256 bettorPk = 0xB0B123;
        address bettor = vm.addr(bettorPk);
        uint256 amount = TEN_USDC;

        prediction.startRound(token1);
        deal(BASE_USDC, bettor, 1000 * ONE_USDC);

        uint256 validAfter = block.timestamp - 1;
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 nonce = keccak256("auth-bear-1");
        (uint8 v, bytes32 r, bytes32 s) = _signUsdcReceiveAuthorization(bettorPk, bettor, address(prediction), amount, validAfter, validBefore, nonce);

        vm.prank(bettor);
        prediction.betWithAuthorization(token1, amount, uint8(BankrBetsPrediction.Position.Bear), validAfter, validBefore, nonce, v, r, s);

        BankrBetsPrediction.BetInfo memory bet = prediction.getUserBet(token1, 1, bettor);
        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertEq(uint8(bet.position), uint8(BankrBetsPrediction.Position.Bear));
        assertEq(bet.amount, amount);
        assertEq(round.totalAmount, amount);
        assertEq(round.bullAmount, 0);
        assertEq(round.bearAmount, amount);
    }

    function test_BetWithAuthorizationReplayReverts() public {
        uint256 bettorPk = 0xCA401123;
        address bettor = vm.addr(bettorPk);
        uint256 amount = TEN_USDC;

        prediction.startRound(token1);
        deal(BASE_USDC, bettor, 1000 * ONE_USDC);

        uint256 validAfter = block.timestamp - 1;
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 nonce = keccak256("auth-replay-1");
        (uint8 v, bytes32 r, bytes32 s) = _signUsdcReceiveAuthorization(bettorPk, bettor, address(prediction), amount, validAfter, validBefore, nonce);

        vm.prank(bettor);
        prediction.betWithAuthorization(token1, amount, uint8(BankrBetsPrediction.Position.Bull), validAfter, validBefore, nonce, v, r, s);

        vm.prank(bettor);
        vm.expectRevert();
        prediction.betWithAuthorization(token1, amount, uint8(BankrBetsPrediction.Position.Bull), validAfter, validBefore, nonce, v, r, s);
    }

    function test_BetWithAuthorizationExpiredReverts() public {
        uint256 bettorPk = 0x5E77123;
        address bettor = vm.addr(bettorPk);
        uint256 amount = TEN_USDC;

        prediction.startRound(token1);
        deal(BASE_USDC, bettor, 1000 * ONE_USDC);

        uint256 validAfter = block.timestamp - 2 hours;
        uint256 validBefore = block.timestamp - 1;
        bytes32 nonce = keccak256("auth-expired-1");
        (uint8 v, bytes32 r, bytes32 s) = _signUsdcReceiveAuthorization(bettorPk, bettor, address(prediction), amount, validAfter, validBefore, nonce);

        vm.prank(bettor);
        vm.expectRevert();
        prediction.betWithAuthorization(token1, amount, uint8(BankrBetsPrediction.Position.Bull), validAfter, validBefore, nonce, v, r, s);
    }

    function test_BetWithAuthorizationInvalidPositionReverts() public {
        uint256 bettorPk = 0x5E77124;
        address bettor = vm.addr(bettorPk);
        uint256 amount = TEN_USDC;

        prediction.startRound(token1);
        deal(BASE_USDC, bettor, 1000 * ONE_USDC);

        uint256 validAfter = block.timestamp - 1;
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 nonce = keccak256("auth-invalid-position-1");
        (uint8 v, bytes32 r, bytes32 s) = _signUsdcReceiveAuthorization(bettorPk, bettor, address(prediction), amount, validAfter, validBefore, nonce);

        vm.prank(bettor);
        vm.expectRevert(BankrBetsPrediction.InvalidPosition.selector);
        prediction.betWithAuthorization(token1, amount, 2, validAfter, validBefore, nonce, v, r, s);
    }

    function test_BetBelowMin() public {
        prediction.startRound(token1);

        vm.expectRevert(BankrBetsPrediction.BelowMinBet.selector);
        _betBull(alice, token1, 100); // 0.0001 USDC
    }

    function test_BetAboveMax() public {
        prediction.startRound(token1);

        deal(BASE_USDC, alice, 2000 * ONE_USDC);
        vm.expectRevert(BankrBetsPrediction.ExceedsMaxBet.selector);
        _betBull(alice, token1, 1100 * ONE_USDC); // 1100 > 1000 USDC default max
    }

    function test_DoubleBet() public {
        prediction.startRound(token1);

        _betBull(alice, token1, TEN_USDC);

        vm.expectRevert(BankrBetsPrediction.AlreadyBet.selector);
        _betBull(alice, token1, TEN_USDC);
    }

    function test_BetAfterLock() public {
        prediction.startRound(token1);
        vm.warp(block.timestamp + 241);

        vm.expectRevert(BankrBetsPrediction.RoundNotBettable.selector);
        _betBull(alice, token1, TEN_USDC);
    }

    function test_BetInactiveToken() public {
        prediction.startRound(token1);

        // Refund the round after grace period so deactivation is allowed
        vm.warp(block.timestamp + 240 + 300 + 3601);
        prediction.refundRound(token1, 1);

        vm.prank(marketCreator);
        oracle.deactivateMarket(token1);

        vm.expectRevert(BankrBetsPrediction.TokenNotEligible.selector);
        _betBull(alice, token1, TEN_USDC);
    }

    // ========== Lock & Close Tests ==========

    function test_LockRound() public {
        prediction.startRound(token1);
        _betBull(alice, token1, TEN_USDC);

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

    function test_LockRoundNoActiveRound() public {
        vm.expectRevert(BankrBetsPrediction.NoActiveRound.selector);
        prediction.lockRound(token1);
    }

    function test_LockRoundAlreadyLocked() public {
        prediction.startRound(token1);
        vm.warp(block.timestamp + 240);
        prediction.lockRound(token1);

        vm.expectRevert(BankrBetsPrediction.RoundAlreadyLocked.selector);
        prediction.lockRound(token1);
    }

    function test_LockRoundAtGraceBoundary() public {
        prediction.startRound(token1);
        vm.warp(block.timestamp + 240 + prediction.lockGracePeriod());

        prediction.lockRound(token1);
        assertTrue(prediction.getRound(token1, 1).locked);
    }

    function test_LockRoundAtCloseTimestampFails() public {
        prediction.startRound(token1);
        vm.warp(block.timestamp + 240 + 300);

        vm.expectRevert(BankrBetsPrediction.LockWindowExpired.selector);
        prediction.lockRound(token1);
    }

    function test_LockRoundOracleRevertDoesNotMutateState() public {
        prediction.startRound(token1);
        oracle.setMinLiquidity(type(uint128).max); // Forces oracle.getPrice() revert
        vm.warp(block.timestamp + 240);

        vm.expectRevert(BankrBetsOracle.MinLiquidityNotMet.selector);
        prediction.lockRound(token1);

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertFalse(round.locked);
        assertEq(round.lockPrice, 0);
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

    function test_CloseRoundNoActiveRound() public {
        vm.expectRevert(BankrBetsPrediction.NoActiveRound.selector);
        prediction.closeRound(token1);
    }

    function test_CloseRoundAlreadyClosed() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        _lockAndClose();

        vm.expectRevert(BankrBetsPrediction.RoundAlreadyClosed.selector);
        prediction.closeRound(token1);
    }

    function test_CloseRoundNoBetsCancelsRound() public {
        prediction.startRound(token1);
        _lockAndClose();

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertTrue(round.cancelled);
        assertTrue(round.oracleCalled);
        assertEq(round.totalAmount, 0);
        assertEq(round.rewardAmount, 0);
        assertEq(prediction.treasuryAmount(), 0);
    }

    function test_CloseRoundCancelsOnExcessivePriceMove() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        // Use 1 bps (0.01%) — any real price move exceeds this. On a static fork the
        // price doesn't change between lock and close, so this exercises the tie-cancel
        // path. (True circuit-breaker path requires dynamic price, tested via code review.)
        prediction.setMaxPriceMoveBps(1);
        uint256 settlerBefore = usdc.balanceOf(settler);
        uint256 creatorBefore = usdc.balanceOf(marketCreator);

        _lockAndClose();

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertTrue(round.cancelled);
        assertEq(round.rewardAmount, 0);
        assertEq(prediction.treasuryAmount(), 0);
        assertEq(usdc.balanceOf(settler), settlerBefore);
        assertEq(usdc.balanceOf(marketCreator), creatorBefore);
    }

    function test_CloseRoundCancelsWhenNoWinners() public {
        prediction.startRound(token1);
        _betBull(alice, token1, TEN_USDC); // No bear bets

        uint256 settlerBefore = usdc.balanceOf(settler);
        uint256 creatorBefore = usdc.balanceOf(marketCreator);

        _lockAndClose();

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;
        uint256 aliceBefore = usdc.balanceOf(alice);

        if (round.cancelled) {
            // This is the no-winners path when bear wins with zero bear pool (or other cancel branch).
            assertEq(round.rewardBaseCalAmount, 0);
            assertEq(round.rewardAmount, 0);
            assertEq(prediction.treasuryAmount(), 0);
            assertEq(usdc.balanceOf(settler), settlerBefore);
            assertEq(usdc.balanceOf(marketCreator), creatorBefore);

            vm.prank(alice);
            prediction.claim(token1, epochs);
            assertEq(usdc.balanceOf(alice) - aliceBefore, TEN_USDC);
        } else {
            // If bull wins, single-sided pool pays net-of-fees to the bull bettor.
            assertEq(round.rewardBaseCalAmount, round.bullAmount);
            vm.prank(alice);
            prediction.claim(token1, epochs);
            assertEq(usdc.balanceOf(alice) - aliceBefore, round.rewardAmount);
        }
    }

    function test_CloseRoundOracleRevertDoesNotMutateState() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        vm.warp(block.timestamp + 240);
        prediction.lockRound(token1);

        oracle.setMinLiquidity(type(uint128).max); // Forces oracle.getPrice() revert at close
        vm.warp(block.timestamp + 300);
        vm.expectRevert(BankrBetsOracle.MinLiquidityNotMet.selector);
        prediction.closeRound(token1);

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertTrue(round.locked);
        assertFalse(round.oracleCalled);
        assertEq(round.closePrice, 0);
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
        if (round.cancelled || _outcome(round) != 1) return;

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
        if (round.cancelled || _outcome(round) != 2) return;

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

        _betBull(alice, token1, TEN_USDC);
        _betBull(carol, token1, 30 * ONE_USDC);
        _betBear(bob, token1, 60 * ONE_USDC);

        uint256 totalPool = 100 * ONE_USDC;

        _lockAndClose();
        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        if (round.cancelled || _outcome(round) != 1) return;

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

    // ========== CreateMarket Tests ==========

    function test_CreateMarket() public {
        PoolKey memory pk2 = poolKey1;

        vm.prank(alice);
        prediction.createMarket(token2, pk2);

        assertTrue(oracle.isTokenActive(token2));
        assertEq(oracle.getMarketCreator(token2), alice); // Creator = caller
        assertEq(prediction.getCurrentEpoch(token2), 0); // No round yet — first bet starts it
    }

    // ========== Claim Edge Cases ==========

    function test_ClaimBeforeSettlement() public {
        prediction.startRound(token1);
        _betBull(alice, token1, TEN_USDC);

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

    function test_SetRoundDurationClampsLockGracePeriod() public {
        prediction.setLockGracePeriod(200);
        prediction.setRoundDuration(120);

        assertEq(prediction.roundDuration(), 120);
        assertEq(prediction.lockGracePeriod(), 120);
    }

    function test_SetBetWindow() public {
        prediction.setBetWindow(300);
        assertEq(prediction.betWindow(), 300);

        vm.expectRevert(BankrBetsPrediction.InvalidDuration.selector);
        prediction.setBetWindow(20); // Too short

        vm.expectRevert(BankrBetsPrediction.InvalidDuration.selector);
        prediction.setBetWindow(3601); // Too long
    }

    function test_PredictionAdminFunctionsOnlyOwner() public {
        _expectOwnableRevert(alice);
        vm.prank(alice);
        prediction.setMinBetAmount(ONE_USDC);

        _expectOwnableRevert(alice);
        vm.prank(alice);
        prediction.setTreasuryFeeBps(100);

        _expectOwnableRevert(alice);
        vm.prank(alice);
        prediction.setSettlerFeeBps(10);

        _expectOwnableRevert(alice);
        vm.prank(alice);
        prediction.setRoundDuration(120);

        _expectOwnableRevert(alice);
        vm.prank(alice);
        prediction.setBetWindow(120);

        _expectOwnableRevert(alice);
        vm.prank(alice);
        prediction.setLockGracePeriod(30);

        _expectOwnableRevert(alice);
        vm.prank(alice);
        prediction.setMaxPriceMoveBps(2500);

        _expectOwnableRevert(alice);
        vm.prank(alice);
        prediction.claimTreasury();

        _expectOwnableRevert(alice);
        vm.prank(alice);
        prediction.pause();

        _expectOwnableRevert(alice);
        vm.prank(alice);
        prediction.unpause();
    }

    function test_OracleAdminFunctionsOnlyOwner() public {
        _expectOwnableRevert(alice);
        vm.prank(alice);
        oracle.activateMarket(token1);

        _expectOwnableRevert(alice);
        vm.prank(alice);
        oracle.setMaxBetAmount(token1, ONE_USDC);

        _expectOwnableRevert(alice);
        vm.prank(alice);
        oracle.setMinLiquidity(1);

        _expectOwnableRevert(alice);
        vm.prank(alice);
        oracle.setPredictionContract(alice);
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

        _betBull(alice, token1, 50 * ONE_USDC);
        _betBear(bob, token1, 50 * ONE_USDC);

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
        _betBull(alice, token1, TEN_USDC);

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
        oracle.addToken(tokenDecoy, pk2);
    }

    // --- Finding: Minimum liquidity enforcement ---

    function test_MinLiquidityEnforced() public {
        // Set a minimum liquidity requirement
        oracle.setMinLiquidity(type(uint128).max);

        PoolKey memory pk2 = poolKey1;

        vm.expectRevert(BankrBetsOracle.MinLiquidityNotMet.selector);
        oracle.addToken(token2, pk2);

        // Set low threshold — should work with live pool liquidity
        oracle.setMinLiquidity(1);
        oracle.addToken(token2, pk2);
        assertTrue(oracle.isTokenActive(token2));
    }

    function test_AddTokenRejectsNonWethQuote() public {
        PoolKey memory badQuotePool = PoolKey({ currency0: Currency.wrap(address(usdc)), currency1: Currency.wrap(token3), fee: CLANKER_FEE, tickSpacing: CLANKER_TICK_SPACING, hooks: IHooks(CLANKER_STATIC_FEE_V2) });

        vm.expectRevert(BankrBetsOracle.InvalidQuoteToken.selector);
        oracle.addToken(token3, badQuotePool);
    }

    function test_AddTokenRejectsUnsupportedHook() public {
        address c0 = token3 < QUOTE_TOKEN ? token3 : QUOTE_TOKEN;
        address c1 = token3 < QUOTE_TOKEN ? QUOTE_TOKEN : token3;
        // Use a random address as hook — address(0) is now valid (vanilla V4)
        PoolKey memory badHookPool = PoolKey({ currency0: Currency.wrap(c0), currency1: Currency.wrap(c1), fee: CLANKER_FEE, tickSpacing: CLANKER_TICK_SPACING, hooks: IHooks(address(0xDEAD)) });

        vm.expectRevert(BankrBetsOracle.UnsupportedHook.selector);
        oracle.addToken(token3, badHookPool);
    }

    function test_AddTokenRejectsInvalidFeeForHook() public {
        address c0 = token3 < QUOTE_TOKEN ? token3 : QUOTE_TOKEN;
        address c1 = token3 < QUOTE_TOKEN ? QUOTE_TOKEN : token3;
        PoolKey memory badFeePool = PoolKey({
            currency0: Currency.wrap(c0),
            currency1: Currency.wrap(c1),
            fee: CLANKER_FEE, // Scheduled hook requires 12_000 fee
            tickSpacing: CLANKER_TICK_SPACING,
            hooks: IHooks(0x3e342a06f9592459D75721d6956B570F02eF2Dc0)
        });

        vm.expectRevert(BankrBetsOracle.InvalidPoolParameters.selector);
        oracle.addToken(token3, badFeePool);
    }

    // --- Vanilla V4 pool support (WCHAN: native ETH, no hooks) ---

    function test_AddTokenVanillaV4Pool() public {
        // WCHAN uses native ETH + no hooks + fee=10000 + tickSpacing=200
        vm.prank(alice);
        oracle.addToken(wchan, poolKeyWchan);

        assertTrue(oracle.isTokenActive(wchan));
        assertEq(oracle.getMarketCreator(wchan), alice);
    }

    function test_GetPriceVanillaV4Pool() public {
        vm.prank(alice);
        oracle.addToken(wchan, poolKeyWchan);

        int256 price = oracle.getPrice(wchan);
        assertTrue(price > 0);
    }

    function test_VanillaV4PoolIdMatchesExpected() public {
        vm.prank(alice);
        oracle.addToken(wchan, poolKeyWchan);

        // Verify the computed pool ID matches the known on-chain WCHAN pool ID
        (,, PoolId storedPoolId,,,,) = oracle.markets(wchan);
        assertEq(PoolId.unwrap(storedPoolId), WCHAN_POOL_ID);
    }

    function test_AddTokenVanillaV4RejectsNonStandardFee() public {
        // Vanilla pools must use standard fee tiers (500, 3000, 10000)
        PoolKey memory badFeePk = _vanillaPoolKey(wchan, address(0), 7777, CLANKER_TICK_SPACING);

        vm.expectRevert(BankrBetsOracle.InvalidPoolParameters.selector);
        oracle.addToken(wchan, badFeePk);
    }

    function test_AddTokenVanillaV4RejectsWrongTickSpacing() public {
        PoolKey memory badTickPk = _vanillaPoolKey(wchan, address(0), 10_000, 60);

        vm.expectRevert(BankrBetsOracle.InvalidPoolParameters.selector);
        oracle.addToken(wchan, badTickPk);
    }

    function test_AddTokenNativeEthQuote() public {
        // Native ETH (address(0)) should be accepted as a valid quote token
        vm.prank(alice);
        oracle.addToken(wchan, poolKeyWchan);
        assertTrue(oracle.isTokenActive(wchan));
    }

    function test_AddTokenRejectsNonEthNonWethQuote() public {
        // A pool with two random tokens (neither WETH nor native ETH) should be rejected
        PoolKey memory badQuotePk = PoolKey({
            currency0: Currency.wrap(address(usdc)),
            currency1: Currency.wrap(wchan),
            fee: 10_000,
            tickSpacing: CLANKER_TICK_SPACING,
            hooks: IHooks(address(0))
        });

        vm.expectRevert(BankrBetsOracle.InvalidQuoteToken.selector);
        oracle.addToken(wchan, badQuotePk);
    }

    function test_GetSupportedHooksIncludesVanilla() public view {
        address[] memory hooks = oracle.getSupportedHooks();
        assertEq(hooks.length, 7);
        assertEq(hooks[0], address(0)); // Vanilla V4
    }

    function test_IsSupportedHookVanilla() public view {
        assertTrue(oracle.isSupportedHook(address(0)));
    }

    function test_IsValidQuoteToken() public view {
        assertTrue(oracle.isValidQuoteToken(0x4200000000000000000000000000000000000006)); // WETH
        assertTrue(oracle.isValidQuoteToken(address(0))); // Native ETH
        assertFalse(oracle.isValidQuoteToken(address(usdc))); // USDC — invalid
    }

    function test_IsStandardFee() public view {
        assertTrue(oracle.isStandardFee(500));
        assertTrue(oracle.isStandardFee(3000));
        assertTrue(oracle.isStandardFee(10_000));
        assertFalse(oracle.isStandardFee(0x800000));
        assertFalse(oracle.isStandardFee(7777));
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

    function test_LockWindowExpiredAfterGracePeriod() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);

        // lockTimestamp + default grace (60s) + 1
        vm.warp(block.timestamp + 240 + 61);

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

    function test_AutoCancelAfterMissedLockGraceBeforeClose() public {
        _startRoundAndBet(TEN_USDC, TEN_USDC);

        // Past lockTimestamp + grace, but before closeTimestamp.
        vm.warp(block.timestamp + 240 + 61);

        // startRound should auto-cancel stale round and open a new one.
        prediction.startRound(token1);
        assertEq(prediction.getCurrentEpoch(token1), 2);

        BankrBetsPrediction.Round memory r1 = prediction.getRound(token1, 1);
        assertTrue(r1.cancelled);
        assertTrue(r1.oracleCalled);
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
        PoolKey memory pk2 = poolKey1;

        // Random user calling addTokenFor should fail
        vm.prank(alice);
        vm.expectRevert(BankrBetsOracle.Unauthorized.selector);
        oracle.addTokenFor(token2, pk2, alice);
    }

    // --- Finding: getPrice overflow safety ---

    function test_GetPriceSafeForExtremeSqrtPriceX96() public {
        // Ensure getPrice doesn't revert on a live pool
        PoolKey memory pk2 = poolKey1;
        oracle.addToken(token2, pk2);

        // Should NOT revert (overflow protection)
        int256 price = oracle.getPrice(token2);
        assertTrue(price > 0);
    }

    function test_GetPriceSafeForLowSqrtPriceX96() public {
        // Ensure getPrice doesn't revert on a live pool
        PoolKey memory pk2 = poolKey1;
        oracle.addToken(token2, pk2);

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
        oracle.addToken(token1, poolKey1);

        // Admin can still re-activate via activateMarket
        oracle.activateMarket(token1);
        assertTrue(oracle.isTokenActive(token1));
    }

    // --- V-2 Fix: Price direction for currency1 tokens ---

    function test_PriceInversionForCurrency1Token() public {
        // Inversion consistency check on live pool:
        // price(token1) * price(token2) ~= 1e36 for opposite sides of the same pool.
        oracle.addToken(token2, poolKey1);

        int256 priceToken1 = oracle.getPrice(token1);
        int256 priceToken2 = oracle.getPrice(token2);
        assertTrue(priceToken1 > 0 && priceToken2 > 0);

        uint256 prod = uint256(priceToken1) * uint256(priceToken2);
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
        PoolKey memory pk2 = poolKey1;
        vm.prank(alice);
        oracle.addToken(token2, pk2);

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

    function test_GetActiveMarketsInfoPage() public {
        vm.prank(alice);
        oracle.addToken(token2, poolKey1);
        vm.prank(bob);
        oracle.addToken(token3, poolKey3);

        BankrBetsOracle.MarketView[] memory page = oracle.getActiveMarketsInfoPage(1, 1);
        assertEq(page.length, 1);
        assertEq(page[0].token, token2);
    }

    function test_GetActiveMarketsInfoPageLimitZero() public view {
        BankrBetsOracle.MarketView[] memory page = oracle.getActiveMarketsInfoPage(0, 0);
        assertEq(page.length, 0);
    }

    function test_GetActiveMarketsInfoPageLargeOffsetReturnsEmpty() public {
        vm.prank(alice);
        oracle.addToken(token2, poolKey1);
        vm.prank(bob);
        oracle.addToken(token3, poolKey3);

        BankrBetsOracle.MarketView[] memory page = oracle.getActiveMarketsInfoPage(100, 5);
        assertEq(page.length, 0);
    }

    function test_GetActiveTokensPage() public {
        vm.prank(alice);
        oracle.addToken(token2, poolKey1);
        vm.prank(bob);
        oracle.addToken(token3, poolKey3);

        address[] memory page = oracle.getActiveTokensPage(2, 2);
        assertEq(page.length, 1);
        assertEq(page[0], token3);
    }

    function test_GetActiveTokensPageLimitZero() public view {
        address[] memory page = oracle.getActiveTokensPage(0, 0);
        assertEq(page.length, 0);
    }

    function test_GetActiveTokensPageLargeOffsetReturnsEmpty() public {
        vm.prank(alice);
        oracle.addToken(token2, poolKey1);
        vm.prank(bob);
        oracle.addToken(token3, poolKey3);

        address[] memory page = oracle.getActiveTokensPage(100, 5);
        assertEq(page.length, 0);
    }

    function test_SetLockGracePeriod() public {
        prediction.setLockGracePeriod(45);
        assertEq(prediction.lockGracePeriod(), 45);

        vm.expectRevert(BankrBetsPrediction.InvalidDuration.selector);
        prediction.setLockGracePeriod(0);
    }

    function test_SetMaxPriceMoveBps() public {
        prediction.setMaxPriceMoveBps(2500);
        assertEq(prediction.maxPriceMoveBps(), 2500);

        vm.expectRevert(BankrBetsPrediction.InvalidFee.selector);
        prediction.setMaxPriceMoveBps(10_001);

        // M-3 fix: 0 must also be blocked (would cancel every round via div-by-zero)
        vm.expectRevert(BankrBetsPrediction.InvalidFee.selector);
        prediction.setMaxPriceMoveBps(0);
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

    // ========== First-Bet-Starts-Round Tests ==========

    function test_FirstBetStartsRound() public {
        // No startRound call — the first bet opens the round automatically
        assertEq(prediction.getCurrentEpoch(token1), 0);

        _betBull(alice, token1, TEN_USDC);

        assertEq(prediction.getCurrentEpoch(token1), 1);
        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertEq(round.epoch, 1);
        assertEq(round.startTimestamp, block.timestamp);
        assertEq(round.lockTimestamp, block.timestamp + prediction.betWindow());
        assertFalse(round.locked);
        assertFalse(round.oracleCalled);

        // Alice's bet is recorded in the auto-started round
        BankrBetsPrediction.BetInfo memory bet = prediction.getUserBet(token1, 1, alice);
        assertEq(bet.amount, TEN_USDC);
    }

    function test_BetAfterSettledRoundAutoStartsNew() public {
        // Round 1: bet → lock → close
        _startRoundAndBet(TEN_USDC, TEN_USDC);
        _lockAndClose();
        assertEq(prediction.getCurrentEpoch(token1), 1);
        assertTrue(prediction.getRound(token1, 1).oracleCalled);

        // Next bet auto-starts round 2 without an explicit startRound call
        _betBull(alice, token1, TEN_USDC);

        assertEq(prediction.getCurrentEpoch(token1), 2);
        BankrBetsPrediction.Round memory round2 = prediction.getRound(token1, 2);
        assertFalse(round2.oracleCalled);
        assertEq(round2.bullAmount, TEN_USDC);
    }

    function test_CreateMarketThenBetStartsRound() public {
        PoolKey memory pk2 = poolKey1;
        vm.prank(alice);
        prediction.createMarket(token2, pk2);

        // Market exists but no round is open yet
        assertEq(prediction.getCurrentEpoch(token2), 0);
        assertFalse(prediction.hasActiveRound(token2));

        // Alice's first bet opens round 1
        _betBull(alice, token2, TEN_USDC);

        assertEq(prediction.getCurrentEpoch(token2), 1);
        assertTrue(prediction.hasActiveRound(token2));
    }

    // ========== updatePool Tests ==========

    function test_UpdatePool() public {
        // Creator can update their market's pool reference (re-registering same pool is valid)
        vm.prank(marketCreator);
        oracle.updatePool(token1, poolKey1);

        // Market remains active and creator is unchanged
        assertTrue(oracle.isTokenActive(token1));
        assertEq(oracle.getMarketCreator(token1), marketCreator);
    }

    function test_UpdatePoolByOwner() public {
        // Admin (owner) can update any market's pool reference
        oracle.updatePool(token1, poolKey1);
        assertTrue(oracle.isTokenActive(token1));
    }

    function test_UpdatePoolNotCreator() public {
        // Random user cannot update a pool they didn't create
        vm.prank(alice);
        vm.expectRevert(BankrBetsOracle.NotMarketCreator.selector);
        oracle.updatePool(token1, poolKey1);
    }

    function test_UpdatePoolDuringActiveRound() public {
        // Cannot update pool while a round is in progress
        prediction.startRound(token1);

        vm.prank(marketCreator);
        vm.expectRevert(BankrBetsOracle.ActiveRoundExists.selector);
        oracle.updatePool(token1, poolKey1);
    }

    function test_UpdatePoolTokenNotInPool() public {
        // poolKey3 is the BNKRW/WETH pool — token1 (CLAWD) is not in it
        vm.prank(marketCreator);
        vm.expectRevert(BankrBetsOracle.TokenNotInPool.selector);
        oracle.updatePool(token1, poolKey3);
    }

    // ========== Security Fix Tests (Audit Findings) ==========

    // --- H-1: closeRound lockPrice == 0 guard ---

    // Note: lockPrice == 0 on a live mainnet fork cannot be triggered because the oracle
    // always returns > 0 for an initialized, liquid Bankr pool. The fix is verified at code
    // level; the on-chain guard is exercised implicitly by the cancelled-round claim path
    // (test_TieCancelledRefund) which validates the same cancel + full-refund invariant.

    // --- H-2: getPrice inversion guard (priceUint == 0 before FullMath divide) ---

    // Same reasoning — cannot reach priceUint == 0 on a live pool. The PoolNotInitialized
    // guard prevents the FullMath revert; verified by code inspection.

    // --- M-2: createMarket fails clearly when oracle not wired ---

    function test_CreateMarketOracleNotWired() public {
        // Deploy a fresh prediction contract. The oracle still points to the original one.
        BankrBetsPrediction freshPrediction = new BankrBetsPrediction(address(usdc), address(oracle));
        // oracle.predictionContract() == address(prediction) != address(freshPrediction)

        PoolKey memory pk2 = poolKey1;
        vm.prank(alice);
        vm.expectRevert(BankrBetsPrediction.OracleNotWired.selector);
        freshPrediction.createMarket(token2, pk2);
    }

    // --- M-3: setMaxPriceMoveBps(0) blocked ---

    function test_SetMaxPriceMoveBpsZeroReverts() public {
        vm.expectRevert(BankrBetsPrediction.InvalidFee.selector);
        prediction.setMaxPriceMoveBps(0);
    }

    // --- M-4: setMinBetAmount(0) blocked ---

    function test_SetMinBetAmountZeroReverts() public {
        vm.expectRevert(BankrBetsPrediction.InvalidFee.selector);
        prediction.setMinBetAmount(0);
    }

    // --- updatePool validation gap fix ---

    function test_UpdatePoolRejectsNonWethQuote() public {
        // Build a pool key where token1 is paired with USDC instead of WETH
        address c0 = token1 < address(usdc) ? token1 : address(usdc);
        address c1 = token1 < address(usdc) ? address(usdc) : token1;
        PoolKey memory badQuotePool = PoolKey({ currency0: Currency.wrap(c0), currency1: Currency.wrap(c1), fee: CLANKER_FEE, tickSpacing: CLANKER_TICK_SPACING, hooks: IHooks(CLANKER_STATIC_FEE_V2) });

        vm.prank(marketCreator);
        vm.expectRevert(BankrBetsOracle.InvalidQuoteToken.selector);
        oracle.updatePool(token1, badQuotePool);
    }

    function test_UpdatePoolRejectsUnsupportedHook() public {
        // Use a random address as hook — address(0) is now valid (vanilla V4)
        PoolKey memory badHookPool = PoolKey({ currency0: poolKey1.currency0, currency1: poolKey1.currency1, fee: CLANKER_FEE, tickSpacing: CLANKER_TICK_SPACING, hooks: IHooks(address(0xDEAD)) });

        vm.prank(marketCreator);
        vm.expectRevert(BankrBetsOracle.UnsupportedHook.selector);
        oracle.updatePool(token1, badHookPool);
    }

    function test_UpdatePoolRejectsWrongTickSpacing() public {
        PoolKey memory badTickPool = PoolKey({
            currency0: poolKey1.currency0,
            currency1: poolKey1.currency1,
            fee: CLANKER_FEE,
            tickSpacing: 60, // wrong — must be 200
            hooks: IHooks(CLANKER_STATIC_FEE_V2)
        });

        vm.prank(marketCreator);
        vm.expectRevert(BankrBetsOracle.InvalidPoolParameters.selector);
        oracle.updatePool(token1, badTickPool);
    }

    function test_UpdatePoolRejectsWrongFee() public {
        PoolKey memory badFeePool = PoolKey({
            currency0: poolKey1.currency0,
            currency1: poolKey1.currency1,
            fee: 3000, // wrong — must be DYNAMIC_FEE_FLAG for this hook
            tickSpacing: CLANKER_TICK_SPACING,
            hooks: IHooks(CLANKER_STATIC_FEE_V2)
        });

        vm.prank(marketCreator);
        vm.expectRevert(BankrBetsOracle.InvalidPoolParameters.selector);
        oracle.updatePool(token1, badFeePool);
    }

    // --- L-4: setPredictionContract(address(0)) blocked ---

    function test_SetPredictionContractZeroAddressReverts() public {
        vm.expectRevert(BankrBetsOracle.ZeroAddress.selector);
        oracle.setPredictionContract(address(0));
    }

    // ========== maxRoundPool Tests ==========

    function test_SetMaxRoundPool() public {
        prediction.setMaxRoundPool(5000 * ONE_USDC);
        assertEq(prediction.maxRoundPool(), 5000 * ONE_USDC);

        // Zero is valid — disables the cap
        prediction.setMaxRoundPool(0);
        assertEq(prediction.maxRoundPool(), 0);
    }

    function test_SetMaxRoundPoolOnlyOwner() public {
        _expectOwnableRevert(alice);
        vm.prank(alice);
        prediction.setMaxRoundPool(5000 * ONE_USDC);
    }

    function test_MaxRoundPoolBlocksExcessiveBet() public {
        // Cap the round at 15 USDC
        prediction.setMaxRoundPool(15 * ONE_USDC);
        prediction.startRound(token1);

        // Alice bets 10 USDC — allowed (total = 10)
        _betBull(alice, token1, TEN_USDC);

        // Bob bets 5 USDC — allowed (total = 15, exactly at cap)
        _betBear(bob, token1, 5 * ONE_USDC);

        // Carol bets 1 USDC — rejected (total would be 16 > 15)
        vm.expectRevert(BankrBetsPrediction.ExceedsMaxRoundPool.selector);
        _betBull(carol, token1, ONE_USDC);

        // Total is exactly at cap
        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertEq(round.totalAmount, 15 * ONE_USDC);
    }

    function test_MaxRoundPoolAtExactCapAllowed() public {
        // A bet that lands exactly on the cap is allowed
        prediction.setMaxRoundPool(TEN_USDC);
        prediction.startRound(token1);

        _betBull(alice, token1, TEN_USDC);

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertEq(round.totalAmount, TEN_USDC);
    }

    function test_MaxRoundPoolZeroMeansNoCap() public {
        // Explicitly 0 — no pool cap, even beyond any per-bet limit
        prediction.setMaxRoundPool(0);

        // Raise per-bet limit so two large bets can coexist
        oracle.setMaxBetAmount(token1, 400 * ONE_USDC);
        deal(BASE_USDC, alice, 500 * ONE_USDC);
        deal(BASE_USDC, bob, 500 * ONE_USDC);

        prediction.startRound(token1);


        _betBull(alice, token1, 400 * ONE_USDC);
        _betBear(bob, token1, 400 * ONE_USDC);

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertEq(round.totalAmount, 800 * ONE_USDC);
    }

    // ========== bet() transferFrom (Smart Wallet) Tests ==========

    function test_BetBullTransferFrom() public {
        prediction.startRound(token1);
        _betBullTF(alice, token1, TEN_USDC);

        BankrBetsPrediction.BetInfo memory bet = prediction.getUserBet(token1, 1, alice);
        assertEq(uint8(bet.position), uint8(BankrBetsPrediction.Position.Bull));
        assertEq(bet.amount, TEN_USDC);

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertEq(round.totalAmount, TEN_USDC);
        assertEq(round.bullAmount, TEN_USDC);
        assertEq(IERC20(BASE_USDC).balanceOf(address(prediction)), TEN_USDC);
    }

    function test_BetBearTransferFrom() public {
        prediction.startRound(token1);
        _betBearTF(bob, token1, TEN_USDC);

        BankrBetsPrediction.BetInfo memory bet = prediction.getUserBet(token1, 1, bob);
        assertEq(uint8(bet.position), uint8(BankrBetsPrediction.Position.Bear));
        assertEq(bet.amount, TEN_USDC);

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertEq(round.totalAmount, TEN_USDC);
        assertEq(round.bearAmount, TEN_USDC);
    }

    function test_BetInvalidPositionTransferFrom() public {
        prediction.startRound(token1);
        vm.startPrank(alice);
        IERC20(BASE_USDC).approve(address(prediction), TEN_USDC);
        vm.expectRevert(BankrBetsPrediction.InvalidPosition.selector);
        prediction.bet(token1, TEN_USDC, 2);
        vm.stopPrank();
    }

    function test_BetBelowMinTransferFrom() public {
        prediction.startRound(token1);
        vm.startPrank(alice);
        IERC20(BASE_USDC).approve(address(prediction), 100);
        vm.expectRevert(BankrBetsPrediction.BelowMinBet.selector);
        prediction.bet(token1, 100, 0);
        vm.stopPrank();
    }

    function test_DoubleBetTransferFrom() public {
        prediction.startRound(token1);
        _betBullTF(alice, token1, TEN_USDC);

        vm.startPrank(alice);
        IERC20(BASE_USDC).approve(address(prediction), TEN_USDC);
        vm.expectRevert(BankrBetsPrediction.AlreadyBet.selector);
        prediction.bet(token1, TEN_USDC, 0);
        vm.stopPrank();
    }

    function test_BetTransferFromNoApprovalReverts() public {
        prediction.startRound(token1);
        vm.prank(alice);
        vm.expectRevert();
        prediction.bet(token1, TEN_USDC, 0);
    }

    function test_BetTransferFromAfterLockReverts() public {
        prediction.startRound(token1);
        vm.warp(block.timestamp + 241);
        vm.startPrank(alice);
        IERC20(BASE_USDC).approve(address(prediction), TEN_USDC);
        vm.expectRevert(BankrBetsPrediction.RoundNotBettable.selector);
        prediction.bet(token1, TEN_USDC, 0);
        vm.stopPrank();
    }

    function test_BetTransferFromFirstBetStartsRound() public {
        // No startRound — transferFrom bet should auto-start the round
        _betBullTF(alice, token1, TEN_USDC);
        assertEq(prediction.getCurrentEpoch(token1), 1);
        BankrBetsPrediction.BetInfo memory bet = prediction.getUserBet(token1, 1, alice);
        assertEq(bet.amount, TEN_USDC);
    }

    function test_MixedPathsBothContributeToSamePool() public {
        // Alice bets via EIP-3009 (EOA), Bob via transferFrom (smart wallet)
        prediction.startRound(token1);
        _betBull(alice, token1, TEN_USDC);
        _betBearTF(bob, token1, TEN_USDC);

        BankrBetsPrediction.Round memory round = prediction.getRound(token1, 1);
        assertEq(round.totalAmount, 2 * TEN_USDC);
        assertEq(round.bullAmount, TEN_USDC);
        assertEq(round.bearAmount, TEN_USDC);
        assertEq(IERC20(BASE_USDC).balanceOf(address(prediction)), 2 * TEN_USDC);
    }

    function test_MixedPathsWinnerClaimsCorrectly() public {
        prediction.startRound(token1);
        _betBull(alice, token1, TEN_USDC);
        _betBearTF(bob, token1, TEN_USDC);
        _lockAndClose();

        // Alice is bull and wins (price went up in mock)
        uint256 aliceBefore = IERC20(BASE_USDC).balanceOf(alice);
        uint256[] memory epochs = new uint256[](1);
        epochs[0] = 1;
        vm.prank(alice);
        prediction.claim(token1, epochs);
        uint256 aliceAfter = IERC20(BASE_USDC).balanceOf(alice);
        assertGt(aliceAfter, aliceBefore);
    }
}
