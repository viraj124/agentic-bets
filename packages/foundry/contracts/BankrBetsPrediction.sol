// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import "./BankrBetsOracle.sol";

/**
 * @title BankrBetsPrediction
 * @notice Permissionless binary prediction market for Bankr ecosystem tokens on Base
 * @dev Users bet UP or DOWN on token prices in 5-minute rounds.
 *      Pari-mutuel payouts: winners split losers' pool minus fees.
 *      Prices read on-chain from Uniswap V4 PoolManager — NO keeper needed.
 *      Settlement is user-triggered: anyone can lock/close rounds and earn 0.1%.
 *
 *      Fee split: 1.5% treasury + 0.5% market creator + 0.1% settler
 *
 *      Security:
 *      - USDC = 6 decimals
 *      - SafeERC20 for all transfers
 *      - CEI pattern + ReentrancyGuard
 *      - Fees in basis points (denominator = 10_000)
 *      - Pausable for emergency stop
 *      - Lock window enforcement prevents same-block lock+close manipulation
 */
contract BankrBetsPrediction is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    // --- Enums ---

    enum Position {
        Bull,
        Bear
    }

    // --- Structs ---

    struct Round {
        uint256 epoch;
        uint256 startTimestamp;
        uint256 lockTimestamp; // When bets lock
        uint256 closeTimestamp; // When round ends
        int256 lockPrice; // Price at lock (18 decimals, read from V4)
        int256 closePrice; // Price at close (18 decimals, read from V4)
        uint256 totalAmount; // Total bet pool (USDC raw units)
        uint256 bullAmount; // Total UP bets
        uint256 bearAmount; // Total DOWN bets
        uint256 rewardBaseCalAmount; // Winning side total
        uint256 rewardAmount; // Pool minus fees
        bool locked; // Lock price recorded
        bool oracleCalled; // Close price recorded & settled
        bool cancelled; // Round cancelled (tie or error)
    }

    struct BetInfo {
        Position position;
        uint256 amount;
        bool claimed;
    }

    // --- Constants ---
    uint256 public constant MAX_BPS = 10_000; // Basis point denominator
    uint256 public constant MAX_TREASURY_FEE_BPS = 500; // 5% max
    uint256 public constant MAX_SETTLER_FEE_BPS = 100; // 1% max
    uint256 public constant CREATOR_FEE_BPS = 50; // 0.5% to market creator
    uint256 public constant REFUND_GRACE_PERIOD = 1 hours;

    // --- State ---

    IERC20 public immutable betToken; // USDC on Base
    BankrBetsOracle public immutable oracle;

    uint256 public roundDuration = 300; // 5 minutes (lock to close)
    uint256 public betWindow = 240; // 4 minutes to bet before lock
    uint256 public minBetAmount = 1_000_000; // 1 USDC (6 decimals)
    uint256 public treasuryFeeBps = 150; // 1.5% = 150 basis points
    uint256 public settlerFeeBps = 10; // 0.1% settler reward
    uint256 public treasuryAmount; // Accumulated treasury

    // Creator earnings tracking
    mapping(address => uint256) public creatorEarnings;

    // token => current epoch
    mapping(address => uint256) public currentEpochs;
    // token => epoch => Round
    mapping(address => mapping(uint256 => Round)) public rounds;
    // token => epoch => user => BetInfo
    mapping(address => mapping(uint256 => mapping(address => BetInfo))) public ledger;
    // token => user => epochs participated
    mapping(address => mapping(address => uint256[])) public userRounds;

    // --- Events ---

    event RoundStarted(address indexed token, uint256 indexed epoch, uint256 startTimestamp, uint256 lockTimestamp);
    event RoundLocked(address indexed token, uint256 indexed epoch, int256 lockPrice, address indexed settler);
    event RoundEnded(address indexed token, uint256 indexed epoch, int256 closePrice, address indexed settler);
    event RoundCancelled(address indexed token, uint256 indexed epoch);
    event RoundRefunded(address indexed token, uint256 indexed epoch);

    event BetBull(address indexed sender, address indexed token, uint256 indexed epoch, uint256 amount);
    event BetBear(address indexed sender, address indexed token, uint256 indexed epoch, uint256 amount);
    event Claim(address indexed sender, address indexed token, uint256 indexed epoch, uint256 amount);
    event SettlerReward(address indexed settler, uint256 amount);
    event CreatorReward(address indexed creator, address indexed token, uint256 amount);
    event TreasuryClaim(address indexed to, uint256 amount);
    event MarketCreated(address indexed token, address indexed creator);

    // --- Errors ---

    error TokenNotEligible();
    error BelowMinBet();
    error ExceedsMaxBet();
    error RoundNotBettable();
    error AlreadyBet();
    error RoundNotSettled();
    error AlreadyClaimed();
    error NoBetPlaced();
    error RoundNotLockable();
    error RoundNotClosable();
    error RoundAlreadyLocked();
    error RoundAlreadyClosed();
    error NoActiveRound();
    error InvalidFee();
    error InvalidDuration();
    error NothingToClaim();
    error RefundNotReady();
    error LockWindowExpired();
    error RoundNotStarted();

    // --- Constructor ---

    constructor(address _betToken, address _oracle) Ownable(msg.sender) {
        betToken = IERC20(_betToken);
        oracle = BankrBetsOracle(_oracle);
    }

    // --- Permissionless Market Creation ---

    /**
     * @notice Create a new prediction market AND start the first round
     * @param _token The token to create a market for
     * @param _poolAddress The pool address (for frontend)
     * @param _poolKey The Uniswap V4 PoolKey
     */
    function createAndStartRound(address _token, address _poolAddress, PoolKey calldata _poolKey) external nonReentrant whenNotPaused {
        oracle.addTokenFor(_token, _poolAddress, _poolKey, msg.sender);
        _startRound(_token);
        emit MarketCreated(_token, msg.sender);
    }

    // --- Core Betting Functions ---

    function betBull(address _token, uint256 _amount) external nonReentrant whenNotPaused {
        _bet(_token, _amount, Position.Bull);
    }

    function betBear(address _token, uint256 _amount) external nonReentrant whenNotPaused {
        _bet(_token, _amount, Position.Bear);
    }

    function _bet(address _token, uint256 _amount, Position _position) internal {
        if (!oracle.isTokenActive(_token)) revert TokenNotEligible();
        if (_amount < minBetAmount) revert BelowMinBet();

        uint256 maxBet = oracle.getMaxBetAmount(_token);
        if (maxBet > 0 && _amount > maxBet) revert ExceedsMaxBet();

        uint256 epoch = currentEpochs[_token];
        if (epoch == 0) revert NoActiveRound();

        Round storage round = rounds[_token][epoch];

        if (block.timestamp < round.startTimestamp || block.timestamp >= round.lockTimestamp) {
            revert RoundNotBettable();
        }
        if (ledger[_token][epoch][msg.sender].amount != 0) revert AlreadyBet();

        // Effects (CEI)
        round.totalAmount += _amount;
        if (_position == Position.Bull) {
            round.bullAmount += _amount;
        } else {
            round.bearAmount += _amount;
        }

        ledger[_token][epoch][msg.sender] = BetInfo({ position: _position, amount: _amount, claimed: false });
        userRounds[_token][msg.sender].push(epoch);

        // Interaction
        betToken.safeTransferFrom(msg.sender, address(this), _amount);

        if (_position == Position.Bull) {
            emit BetBull(msg.sender, _token, epoch, _amount);
        } else {
            emit BetBear(msg.sender, _token, epoch, _amount);
        }
    }

    // --- User-Triggered Settlement ---

    /**
     * @notice Start a new round — callable by ANYONE
     */
    function startRound(address _token) external nonReentrant whenNotPaused {
        if (!oracle.isTokenActive(_token)) revert TokenNotEligible();

        uint256 epoch = currentEpochs[_token];
        if (epoch > 0) {
            Round storage prevRound = rounds[_token][epoch];
            if (!prevRound.oracleCalled && !prevRound.cancelled) revert RoundNotSettled();
        }

        _startRound(_token);
    }

    function _startRound(address _token) internal {
        uint256 newEpoch = currentEpochs[_token] + 1;
        currentEpochs[_token] = newEpoch;

        uint256 lockTime = block.timestamp + betWindow;
        uint256 closeTime = lockTime + roundDuration;

        rounds[_token][newEpoch] = Round({
            epoch: newEpoch,
            startTimestamp: block.timestamp,
            lockTimestamp: lockTime,
            closeTimestamp: closeTime,
            lockPrice: 0,
            closePrice: 0,
            totalAmount: 0,
            bullAmount: 0,
            bearAmount: 0,
            rewardBaseCalAmount: 0,
            rewardAmount: 0,
            locked: false,
            oracleCalled: false,
            cancelled: false
        });

        emit RoundStarted(_token, newEpoch, block.timestamp, lockTime);
    }

    /**
     * @notice Lock a round — callable by ANYONE after lock time but before close time
     * @dev Reads price from Uniswap V4 on-chain.
     *      The lock window is enforced: must be called BEFORE closeTimestamp.
     *      This prevents the exploit where an attacker delays lock until after close,
     *      then calls lock+close in the same block to force lockPrice == closePrice (tie/refund).
     */
    function lockRound(address _token) external nonReentrant {
        uint256 epoch = currentEpochs[_token];
        if (epoch == 0) revert NoActiveRound();

        Round storage round = rounds[_token][epoch];
        if (round.locked) revert RoundAlreadyLocked();
        if (block.timestamp < round.lockTimestamp) revert RoundNotLockable();
        if (block.timestamp >= round.closeTimestamp) revert LockWindowExpired();

        int256 price = oracle.getPrice(_token);
        round.lockPrice = price;
        round.locked = true;

        emit RoundLocked(_token, epoch, price, msg.sender);
    }

    /**
     * @notice Close and settle a round — callable by ANYONE after close time
     * @dev Reads V4 price, determines winners, distributes fees. Caller earns 0.1%.
     */
    function closeRound(address _token) external nonReentrant {
        uint256 epoch = currentEpochs[_token];
        if (epoch == 0) revert NoActiveRound();

        Round storage round = rounds[_token][epoch];
        if (round.oracleCalled) revert RoundAlreadyClosed();
        if (!round.locked) revert RoundNotLockable();
        if (block.timestamp < round.closeTimestamp) revert RoundNotClosable();

        int256 price = oracle.getPrice(_token);
        round.closePrice = price;
        round.oracleCalled = true;

        if (round.totalAmount == 0) {
            round.cancelled = true;
            emit RoundCancelled(_token, epoch);
            return;
        }

        // Calculate fees
        uint256 treasuryFee = (round.totalAmount * treasuryFeeBps) / MAX_BPS;
        uint256 creatorFee = (round.totalAmount * CREATOR_FEE_BPS) / MAX_BPS;
        uint256 settlerFee = (round.totalAmount * settlerFeeBps) / MAX_BPS;

        treasuryAmount += treasuryFee;
        round.rewardAmount = round.totalAmount - treasuryFee - creatorFee - settlerFee;

        // Determine winner
        if (price > round.lockPrice) {
            round.rewardBaseCalAmount = round.bullAmount;
        } else if (price < round.lockPrice) {
            round.rewardBaseCalAmount = round.bearAmount;
        } else {
            // Tie
            round.cancelled = true;
            round.rewardAmount = 0;
            treasuryAmount -= treasuryFee;
            emit RoundCancelled(_token, epoch);
            return;
        }

        // All bets on winning side = no losers
        if (round.rewardBaseCalAmount == 0) {
            round.cancelled = true;
            round.rewardAmount = 0;
            treasuryAmount -= treasuryFee;
            emit RoundCancelled(_token, epoch);
            return;
        }

        // Pay settler
        if (settlerFee > 0) {
            betToken.safeTransfer(msg.sender, settlerFee);
            emit SettlerReward(msg.sender, settlerFee);
        }

        // Pay creator
        address creator = oracle.getMarketCreator(_token);
        if (creatorFee > 0 && creator != address(0)) {
            creatorEarnings[creator] += creatorFee;
            betToken.safeTransfer(creator, creatorFee);
            emit CreatorReward(creator, _token, creatorFee);
        }

        emit RoundEnded(_token, epoch, price, msg.sender);
    }

    /**
     * @notice Refund a round that was never settled after grace period
     * @dev Requires the round to actually exist (startTimestamp != 0)
     */
    function refundRound(address _token, uint256 _epoch) external nonReentrant {
        Round storage round = rounds[_token][_epoch];
        if (round.startTimestamp == 0) revert RoundNotStarted();
        if (round.oracleCalled) revert RoundAlreadyClosed();
        if (block.timestamp < round.closeTimestamp + REFUND_GRACE_PERIOD) revert RefundNotReady();

        round.cancelled = true;
        round.oracleCalled = true;
        emit RoundRefunded(_token, _epoch);
    }

    // --- Claim Functions ---

    function claim(address _token, uint256[] calldata _epochs) external nonReentrant {
        uint256 totalReward;

        for (uint256 i = 0; i < _epochs.length; i++) {
            uint256 epoch = _epochs[i];
            Round storage round = rounds[_token][epoch];
            BetInfo storage bet = ledger[_token][epoch][msg.sender];

            if (!round.oracleCalled) revert RoundNotSettled();
            if (bet.claimed) revert AlreadyClaimed();
            if (bet.amount == 0) revert NoBetPlaced();

            bet.claimed = true;

            uint256 reward;
            if (round.cancelled) {
                reward = bet.amount;
            } else {
                bool won = _isWinner(round, bet.position);
                if (won) {
                    reward = (bet.amount * round.rewardAmount) / round.rewardBaseCalAmount;
                }
            }

            totalReward += reward;
            emit Claim(msg.sender, _token, epoch, reward);
        }

        if (totalReward == 0) revert NothingToClaim();
        betToken.safeTransfer(msg.sender, totalReward);
    }

    function _isWinner(Round storage _round, Position _position) internal view returns (bool) {
        if (_round.closePrice > _round.lockPrice && _position == Position.Bull) return true;
        if (_round.closePrice < _round.lockPrice && _position == Position.Bear) return true;
        return false;
    }

    // --- View Functions ---

    function getCurrentEpoch(address _token) external view returns (uint256) {
        return currentEpochs[_token];
    }

    function getRound(address _token, uint256 _epoch) external view returns (Round memory) {
        return rounds[_token][_epoch];
    }

    function getUserBet(address _token, uint256 _epoch, address _user) external view returns (BetInfo memory) {
        return ledger[_token][_epoch][_user];
    }

    function getUserRounds(address _token, address _user) external view returns (uint256[] memory) {
        return userRounds[_token][_user];
    }

    function claimable(address _token, uint256 _epoch, address _user) external view returns (bool) {
        Round storage round = rounds[_token][_epoch];
        BetInfo storage bet = ledger[_token][_epoch][_user];

        if (!round.oracleCalled || bet.claimed || bet.amount == 0) return false;
        if (round.cancelled) return true;
        return _isWinner(round, bet.position);
    }

    /**
     * @notice Whether the current round can be locked
     * @dev Must be after lockTimestamp AND before closeTimestamp (lock window enforcement)
     */
    function isLockable(address _token) external view returns (bool) {
        uint256 epoch = currentEpochs[_token];
        if (epoch == 0) return false;
        Round storage round = rounds[_token][epoch];
        return !round.locked && block.timestamp >= round.lockTimestamp && block.timestamp < round.closeTimestamp;
    }

    function isClosable(address _token) external view returns (bool) {
        uint256 epoch = currentEpochs[_token];
        if (epoch == 0) return false;
        Round storage round = rounds[_token][epoch];
        return round.locked && !round.oracleCalled && block.timestamp >= round.closeTimestamp;
    }

    function getSettlerReward(address _token) external view returns (uint256) {
        uint256 epoch = currentEpochs[_token];
        if (epoch == 0) return 0;
        return (rounds[_token][epoch].totalAmount * settlerFeeBps) / MAX_BPS;
    }

    /**
     * @notice Check whether a token has an active (unsettled, uncancelled) round
     * @dev Used by Oracle to prevent pause/deactivate during active rounds
     */
    function hasActiveRound(address _token) external view returns (bool) {
        uint256 epoch = currentEpochs[_token];
        if (epoch == 0) return false;
        Round storage round = rounds[_token][epoch];
        return !round.oracleCalled && !round.cancelled;
    }

    // --- Admin Functions ---

    function cancelRound(address _token, uint256 _epoch) external onlyOwner {
        Round storage round = rounds[_token][_epoch];
        round.cancelled = true;
        round.oracleCalled = true;
        emit RoundCancelled(_token, _epoch);
    }

    function setMinBetAmount(uint256 _minBetAmount) external onlyOwner {
        minBetAmount = _minBetAmount;
    }

    function setTreasuryFeeBps(uint256 _feeBps) external onlyOwner {
        if (_feeBps > MAX_TREASURY_FEE_BPS) revert InvalidFee();
        treasuryFeeBps = _feeBps;
    }

    function setSettlerFeeBps(uint256 _feeBps) external onlyOwner {
        if (_feeBps > MAX_SETTLER_FEE_BPS) revert InvalidFee();
        settlerFeeBps = _feeBps;
    }

    function setRoundDuration(uint256 _duration) external onlyOwner {
        if (_duration < 60 || _duration > 3600) revert InvalidDuration();
        roundDuration = _duration;
    }

    function setBetWindow(uint256 _window) external onlyOwner {
        if (_window < 30 || _window > 3600) revert InvalidDuration();
        betWindow = _window;
    }

    function claimTreasury() external onlyOwner {
        uint256 amount = treasuryAmount;
        if (amount == 0) revert NothingToClaim();
        treasuryAmount = 0;
        betToken.safeTransfer(msg.sender, amount);
        emit TreasuryClaim(msg.sender, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
