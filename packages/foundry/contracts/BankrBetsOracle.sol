// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { PoolId, PoolIdLibrary } from "@uniswap/v4-core/src/types/PoolId.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { StateLibrary } from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import { TickMath } from "@uniswap/v4-core/src/libraries/TickMath.sol";
import { FullMath } from "@uniswap/v4-core/src/libraries/FullMath.sol";
import { FixedPoint96 } from "@uniswap/v4-core/src/libraries/FixedPoint96.sol";

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
    uint256 public constant DEFAULT_MAX_BET_AMOUNT = 500_000_000; // 500 USDC

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

    // --- Constructor ---

    constructor(address _poolManager) Ownable(msg.sender) {
        if (_poolManager == address(0)) revert ZeroAddress();
        poolManager = IPoolManager(_poolManager);
    }

    // --- Permissionless Market Registration ---

    /**
     * @notice Register a new prediction market for a token — callable by ANYONE
     * @param _token The token address to create a market for
     * @param _poolAddress The pool address (for frontend reference / GeckoTerminal)
     * @param _poolKey The Uniswap V4 PoolKey for on-chain price reads
     */
    function addToken(address _token, address _poolAddress, PoolKey calldata _poolKey) external {
        _addToken(_token, _poolAddress, _poolKey, msg.sender);
    }

    /**
     * @notice Register a market on behalf of a creator — restricted to Prediction contract
     */
    function addTokenFor(address _token, address _poolAddress, PoolKey calldata _poolKey, address _creator) external {
        if (msg.sender != predictionContract) revert Unauthorized();
        if (_creator == address(0)) revert ZeroAddress();
        _addToken(_token, _poolAddress, _poolKey, _creator);
    }

    function _addToken(address _token, address _poolAddress, PoolKey calldata _poolKey, address _creator) internal {
        if (_token == address(0)) revert ZeroAddress();
        if (markets[_token].creator != address(0)) revert MarketAlreadyExists();

        // Validate the market token is actually in the pool
        address c0 = Currency.unwrap(_poolKey.currency0);
        address c1 = Currency.unwrap(_poolKey.currency1);
        if (_token != c0 && _token != c1) revert TokenNotInPool();

        PoolId poolId = _poolKey.toId();

        // Verify the pool exists and is initialized by reading its slot0
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(poolId);
        if (sqrtPriceX96 == 0) revert PoolNotInitialized();

        // Check minimum liquidity threshold (prevents tiny/manipulable pools)
        if (minLiquidity > 0) {
            uint128 liquidity = poolManager.getLiquidity(poolId);
            if (liquidity < minLiquidity) revert MinLiquidityNotMet();
        }

        markets[_token] = MarketInfo({ creator: _creator, poolAddress: _poolAddress, poolId: poolId, maxBetAmount: DEFAULT_MAX_BET_AMOUNT, active: true, isToken0: (_token == c0), createdAt: block.timestamp });
        marketList.push(_token);

        emit MarketCreated(_token, _creator, _poolAddress, poolId);
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
        predictionContract = _predictionContract;
        emit PredictionContractUpdated(_predictionContract);
    }
}
