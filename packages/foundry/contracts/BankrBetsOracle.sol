// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { StateLibrary } from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import { FullMath } from "@uniswap/v4-core/src/libraries/FullMath.sol";

/// @notice Minimal interface for querying active rounds from the Prediction contract
interface IBankrBetsPrediction {
    function hasActiveRound(address token) external view returns (bool);
}

/**
 * @title BankrBetsOracle
 * @notice Permissionless market registry + on-chain V4 price oracle for BankrBets
 * @dev Anyone can register a market for any token with a Uniswap V4 pool.
 *      Prices are read directly on-chain from PoolManager.getSlot0() — no keeper needed.
 *      Market creators earn 0.5% of every settled round's pool.
 */
contract BankrBetsOracle is Ownable {
    using StateLibrary for IPoolManager;

    // --- Bankr / Clanker V4 constraints (Base) ---

    address public constant WETH_BASE = 0x4200000000000000000000000000000000000006;
    address public constant NATIVE_ETH = address(0); // V4 uses address(0) for native ETH
    uint24 public constant DYNAMIC_FEE_FLAG = 0x800000;
    uint24 public constant BANKR_SCHEDULED_FEE = 12_000;
    int24 public constant REQUIRED_TICK_SPACING = 200;

    // Standard Uniswap V4 fee tiers accepted for hookless (vanilla) pools
    uint24 public constant STANDARD_FEE_500 = 500; // 0.05%
    uint24 public constant STANDARD_FEE_3000 = 3000; // 0.30%
    uint24 public constant STANDARD_FEE_10000 = 10_000; // 1.00%

    // Clanker hooks (legacy + current)
    address public constant CLANKER_DYNAMIC_FEE_V2_HOOK = 0xd60D6B218116cFd801E28F78d011a203D2b068Cc;
    address public constant CLANKER_STATIC_FEE_V2_HOOK = 0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC;
    address public constant CLANKER_DYNAMIC_FEE_HOOK = 0x34a45c6B61876d739400Bd71228CbcbD4F53E8cC;
    address public constant CLANKER_STATIC_FEE_HOOK = 0xDd5EeaFf7BD481AD55Db083062b13a3cdf0A68CC;

    // Bankr launcher hooks (old + current)
    address public constant BANKR_SCHEDULED_MULTICURVE_HOOK = 0x3e342a06f9592459D75721d6956B570F02eF2Dc0;
    address public constant BANKR_DECAY_MULTICURVE_HOOK = 0xbB7784A4d481184283Ed89619A3e3ed143e1Adc0;

    // --- Structs ---

    struct MarketInfo {
        address creator; // Who registered this market (earns creator fee)
        address poolAddress; // Pool reference for frontend (GeckoTerminal lookup)
        PoolId poolId; // V4 pool ID for on-chain price reads
        uint256 maxBetAmount; // Max bet in USDC raw units (6 decimals), 0 = no limit
        bool active;
        bool isToken0; // True if market token is currency0 in the V4 pool
        uint256 createdAt;
    }

    // Default max bet for new markets (admin-configurable)
    uint256 public constant DEFAULT_MAX_BET_AMOUNT = 1_000_000_000; // 1000 USDC

    // --- State ---

    IPoolManager public immutable poolManager;

    mapping(address => MarketInfo) public markets;
    address[] public marketList;

    // Minimum pool liquidity required for market registration (0 = no minimum)
    uint128 public minLiquidity;

    // Prediction contract reference (for addTokenFor access control + active round checks)
    address public predictionContract;

    // --- Events ---

    event MarketCreated(address indexed token, address indexed creator, address poolAddress, PoolId poolId);
    event MarketDeactivated(address indexed token);
    event MarketActivated(address indexed token);
    event DefaultMaxBetUpdated(uint256 newMaxBet);
    event MinLiquidityUpdated(uint128 newMinLiquidity);
    event PredictionContractUpdated(address newPredictionContract);
    event PoolUpdated(address indexed token, address poolAddress, PoolId poolId);

    // --- Errors ---

    error MarketAlreadyExists();
    error MarketNotActive();
    error ZeroAddress();
    error PoolNotInitialized();
    error NotMarketCreator();
    error TokenNotInPool();
    error MinLiquidityNotMet();
    error ActiveRoundExists();
    error Unauthorized();
    error InvalidQuoteToken();
    error UnsupportedHook();
    error InvalidPoolParameters();

    // --- Constructor ---

    constructor(address _poolManager) Ownable(msg.sender) {
        if (_poolManager == address(0)) revert ZeroAddress();
        poolManager = IPoolManager(_poolManager);
    }

    // --- Permissionless Market Registration ---

    /**
     * @notice Register a new prediction market for a token — callable by ANYONE
     * @param _token The token address to create a market for
     * @param _poolKey The Uniswap V4 PoolKey for on-chain price reads
     */
    function addToken(address _token, PoolKey calldata _poolKey) external {
        _addToken(_token, _poolKey, msg.sender);
    }

    /**
     * @notice Register a market on behalf of a creator — restricted to Prediction contract
     */
    function addTokenFor(address _token, PoolKey calldata _poolKey, address _creator) external {
        if (msg.sender != predictionContract) revert Unauthorized();
        if (_creator == address(0)) revert ZeroAddress();
        _addToken(_token, _poolKey, _creator);
    }

    function _addToken(address _token, PoolKey calldata _poolKey, address _creator) internal {
        if (_token == address(0)) revert ZeroAddress();
        if (markets[_token].creator != address(0)) revert MarketAlreadyExists();

        // Validate the market token is actually in the pool
        address c0 = Currency.unwrap(_poolKey.currency0);
        address c1 = Currency.unwrap(_poolKey.currency1);
        if (_token != c0 && _token != c1) revert TokenNotInPool();

        _validatePoolKey(_poolKey, c0, c1);

        PoolId poolId = _poolKey.toId();
        address canonicalPoolAddress = address(bytes20(PoolId.unwrap(poolId)));

        // Verify the pool exists and is initialized by reading its slot0
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
        if (sqrtPriceX96 == 0) revert PoolNotInitialized();

        // Check minimum liquidity threshold (prevents tiny/manipulable pools)
        if (minLiquidity > 0) {
            uint128 liquidity = poolManager.getLiquidity(poolId);
            if (liquidity < minLiquidity) revert MinLiquidityNotMet();
        }

        markets[_token] = MarketInfo({ creator: _creator, poolAddress: canonicalPoolAddress, poolId: poolId, maxBetAmount: DEFAULT_MAX_BET_AMOUNT, active: true, isToken0: (_token == c0), createdAt: block.timestamp });
        marketList.push(_token);

        emit MarketCreated(_token, _creator, canonicalPoolAddress, poolId);
    }

    function isSupportedHook(address _hook) public pure returns (bool) {
        return _hook == address(0) // Vanilla V4 (no hooks)
            || _hook == CLANKER_DYNAMIC_FEE_V2_HOOK || _hook == CLANKER_STATIC_FEE_V2_HOOK || _hook == CLANKER_DYNAMIC_FEE_HOOK || _hook == CLANKER_STATIC_FEE_HOOK || _hook == BANKR_SCHEDULED_MULTICURVE_HOOK
            || _hook == BANKR_DECAY_MULTICURVE_HOOK;
    }

    function isValidQuoteToken(address _token) public pure returns (bool) {
        return _token == WETH_BASE || _token == NATIVE_ETH;
    }

    function isStandardFee(uint24 _fee) public pure returns (bool) {
        return _fee == STANDARD_FEE_500 || _fee == STANDARD_FEE_3000 || _fee == STANDARD_FEE_10000;
    }

    /**
     * @dev Shared pool key validation for _addToken and updatePool.
     *      Supports both Bankr/Clanker hooked pools (WETH quote, dynamic fee)
     *      and vanilla V4 pools (native ETH or WETH, standard fee tiers, no hooks).
     */
    function _validatePoolKey(PoolKey calldata _poolKey, address c0, address c1) internal pure {
        // Quote token must be WETH or native ETH
        if (!isValidQuoteToken(c0) && !isValidQuoteToken(c1)) revert InvalidQuoteToken();

        address hook = address(_poolKey.hooks);
        if (!isSupportedHook(hook)) revert UnsupportedHook();
        if (_poolKey.tickSpacing != REQUIRED_TICK_SPACING) revert InvalidPoolParameters();

        if (hook == address(0)) {
            // Vanilla V4 pool — must use a standard Uniswap fee tier
            if (!isStandardFee(_poolKey.fee)) revert InvalidPoolParameters();
        } else if (hook == BANKR_SCHEDULED_MULTICURVE_HOOK) {
            if (_poolKey.fee != BANKR_SCHEDULED_FEE) revert InvalidPoolParameters();
        } else {
            if (_poolKey.fee != DYNAMIC_FEE_FLAG) revert InvalidPoolParameters();
        }
    }

    function getSupportedHooks() external pure returns (address[] memory hooks) {
        hooks = new address[](7);
        hooks[0] = address(0); // Vanilla V4 (no hooks)
        hooks[1] = CLANKER_DYNAMIC_FEE_V2_HOOK;
        hooks[2] = CLANKER_STATIC_FEE_V2_HOOK;
        hooks[3] = CLANKER_DYNAMIC_FEE_HOOK;
        hooks[4] = CLANKER_STATIC_FEE_HOOK;
        hooks[5] = BANKR_SCHEDULED_MULTICURVE_HOOK;
        hooks[6] = BANKR_DECAY_MULTICURVE_HOOK;
    }

    /**
     * @notice Deactivate a market — callable by the market creator OR the admin
     * @dev Cannot deactivate while a round is in progress (unsettled)
     * @param _token The token to deactivate
     */
    function deactivateMarket(address _token) external {
        if (!markets[_token].active) revert MarketNotActive();
        if (msg.sender != markets[_token].creator && msg.sender != owner()) revert NotMarketCreator();
        _requireNoActiveRound(_token);
        markets[_token].active = false;
        emit MarketDeactivated(_token);
    }

    /**
     * @notice Update the pool reference for an existing market — callable by creator or admin
     * @dev Cannot update while a round is in progress.
     *      Validates the new pool contains the token, is initialized, and meets liquidity requirements.
     * @param _token The token market to update
     * @param _poolKey The new Uniswap V4 PoolKey
     */
    function updatePool(address _token, PoolKey calldata _poolKey) external {
        MarketInfo storage market = markets[_token];
        if (msg.sender != market.creator && msg.sender != owner()) revert NotMarketCreator();
        _requireNoActiveRound(_token);

        address c0 = Currency.unwrap(_poolKey.currency0);
        address c1 = Currency.unwrap(_poolKey.currency1);
        if (_token != c0 && _token != c1) revert TokenNotInPool();

        _validatePoolKey(_poolKey, c0, c1);

        PoolId poolId = _poolKey.toId();
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
        if (sqrtPriceX96 == 0) revert PoolNotInitialized();

        if (minLiquidity > 0) {
            uint128 liquidity = poolManager.getLiquidity(poolId);
            if (liquidity < minLiquidity) revert MinLiquidityNotMet();
        }

        address canonicalPoolAddress = address(bytes20(PoolId.unwrap(poolId)));
        market.poolAddress = canonicalPoolAddress;
        market.poolId = poolId;
        market.isToken0 = (_token == c0);

        emit PoolUpdated(_token, canonicalPoolAddress, poolId);
    }

    // --- On-Chain Price Reading ---

    /**
     * @notice Get the current price of a token from its Uniswap V4 pool
     * @dev Reads sqrtPriceX96 from PoolManager and converts to a price with 18 decimals.
     *      Uses two-step FullMath.mulDiv to avoid uint256 overflow for extreme sqrtPriceX96 values.
     *      Price direction is normalized: always rises when market token appreciates.
     *      If market token is currency0, returns raw token1/token0.
     *      If market token is currency1, inverts to token0/token1.
     * @param _token The token to get the price for
     * @return price The current price in 18-decimal fixed point
     */
    function getPrice(address _token) external view returns (int256 price) {
        MarketInfo storage market = markets[_token];
        if (!market.active) revert MarketNotActive();

        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(market.poolId);
        if (sqrtPriceX96 == 0) revert PoolNotInitialized();

        // Runtime liquidity check — pool may have been drained since registration
        if (minLiquidity > 0) {
            uint128 liquidity = poolManager.getLiquidity(market.poolId);
            if (liquidity < minLiquidity) revert MinLiquidityNotMet();
        }

        // Convert sqrtPriceX96 to price with 18 decimals
        // Raw V4 price = token1/token0. If market token is currency1, invert to get token0/token1.
        //
        // Two-step FullMath to avoid overflow (sqrtPriceX96 is uint160, square can exceed uint256):
        // Step 1: ratioX96 = sqrtPriceX96^2 / 2^96 (max = 2^224, fits uint256)
        // Step 2: price = ratioX96 * 1e18 / 2^96 (FullMath handles 512-bit intermediate)
        uint256 ratioX96 = FullMath.mulDiv(uint256(sqrtPriceX96), uint256(sqrtPriceX96), uint256(1) << 96);
        uint256 priceUint = FullMath.mulDiv(ratioX96, 1e18, uint256(1) << 96);

        // If market token is currency1, invert so price rises when market token appreciates
        if (!market.isToken0) {
            // H-2: priceUint == 0 means sqrtPriceX96 was so small that ratioX96 rounded to 0.
            // Inverting 0 would cause a FullMath division-by-zero revert; treat as uninitialized pool.
            if (priceUint == 0) revert PoolNotInitialized();
            priceUint = FullMath.mulDiv(1e18, 1e18, priceUint);
        }

        price = int256(priceUint);
    }

    // --- View Functions ---

    struct MarketView {
        address token;
        address creator;
        address poolAddress;
        uint256 createdAt;
    }

    /**
     * @notice Batch read all active markets in a single call
     * @return result Array of active market info (token, creator, poolAddress, createdAt)
     */
    function getActiveMarketsInfo() external view returns (MarketView[] memory result) {
        uint256 count = 0;
        for (uint256 i = 0; i < marketList.length;) {
            if (markets[marketList[i]].active) count++;
            unchecked {
                ++i;
            }
        }

        result = new MarketView[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < marketList.length;) {
            address token = marketList[i];
            if (markets[token].active) {
                MarketInfo storage m = markets[token];
                result[idx++] = MarketView({ token: token, creator: m.creator, poolAddress: m.poolAddress, createdAt: m.createdAt });
            }
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Paginated active market view to avoid large unbounded reads.
     * @param _offset Number of active markets to skip.
     * @param _limit Max number of active markets to return.
     */
    function getActiveMarketsInfoPage(uint256 _offset, uint256 _limit) external view returns (MarketView[] memory result) {
        if (_limit == 0) return new MarketView[](0);

        uint256 skip = _offset;
        uint256 count = 0;
        for (uint256 i = 0; i < marketList.length && count < _limit;) {
            address token = marketList[i];
            if (markets[token].active) {
                if (skip > 0) {
                    skip--;
                } else {
                    count++;
                }
            }
            unchecked {
                ++i;
            }
        }

        result = new MarketView[](count);
        skip = _offset;
        uint256 idx = 0;
        for (uint256 i = 0; i < marketList.length && idx < count;) {
            address token = marketList[i];
            if (markets[token].active) {
                if (skip > 0) {
                    skip--;
                } else {
                    MarketInfo storage m = markets[token];
                    result[idx++] = MarketView({ token: token, creator: m.creator, poolAddress: m.poolAddress, createdAt: m.createdAt });
                }
            }
            unchecked {
                ++i;
            }
        }
    }

    function isTokenActive(address _token) external view returns (bool) {
        return markets[_token].active;
    }

    function getMaxBetAmount(address _token) external view returns (uint256) {
        return markets[_token].maxBetAmount;
    }

    function getMarketCreator(address _token) external view returns (address) {
        return markets[_token].creator;
    }

    function getTokenCount() external view returns (uint256) {
        return marketList.length;
    }

    function getActiveTokens() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < marketList.length;) {
            if (markets[marketList[i]].active) count++;
            unchecked {
                ++i;
            }
        }

        address[] memory active = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < marketList.length;) {
            if (markets[marketList[i]].active) {
                active[idx++] = marketList[i];
            }
            unchecked {
                ++i;
            }
        }
        return active;
    }

    /**
     * @notice Paginated active token list to avoid large unbounded reads.
     * @param _offset Number of active tokens to skip.
     * @param _limit Max number of active tokens to return.
     */
    function getActiveTokensPage(uint256 _offset, uint256 _limit) external view returns (address[] memory result) {
        if (_limit == 0) return new address[](0);

        uint256 skip = _offset;
        uint256 count = 0;
        for (uint256 i = 0; i < marketList.length && count < _limit;) {
            address token = marketList[i];
            if (markets[token].active) {
                if (skip > 0) {
                    skip--;
                } else {
                    count++;
                }
            }
            unchecked {
                ++i;
            }
        }

        result = new address[](count);
        skip = _offset;
        uint256 idx = 0;
        for (uint256 i = 0; i < marketList.length && idx < count;) {
            address token = marketList[i];
            if (markets[token].active) {
                if (skip > 0) {
                    skip--;
                } else {
                    result[idx++] = token;
                }
            }
            unchecked {
                ++i;
            }
        }
    }

    // --- Internal ---

    /**
     * @dev Reverts if the market has an unsettled round in the Prediction contract
     */
    function _requireNoActiveRound(address _token) internal view {
        if (predictionContract != address(0)) {
            if (IBankrBetsPrediction(predictionContract).hasActiveRound(_token)) {
                revert ActiveRoundExists();
            }
        }
    }

    // --- Admin Functions ---

    /**
     * @notice Re-activate a deactivated market — admin only
     */
    function activateMarket(address _token) external onlyOwner {
        if (markets[_token].creator == address(0)) revert ZeroAddress();
        if (markets[_token].active) revert MarketAlreadyExists();
        markets[_token].active = true;
        emit MarketActivated(_token);
    }

    function setMaxBetAmount(address _token, uint256 _maxBetAmount) external onlyOwner {
        if (!markets[_token].active) revert MarketNotActive();
        markets[_token].maxBetAmount = _maxBetAmount;
    }

    function setMinLiquidity(uint128 _minLiquidity) external onlyOwner {
        minLiquidity = _minLiquidity;
        emit MinLiquidityUpdated(_minLiquidity);
    }

    function setPredictionContract(address _predictionContract) external onlyOwner {
        if (_predictionContract == address(0)) revert ZeroAddress();
        predictionContract = _predictionContract;
        emit PredictionContractUpdated(_predictionContract);
    }
}
