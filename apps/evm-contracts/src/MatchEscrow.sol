// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/**
 * @title MatchEscrow
 * @notice Minimal 1v1 stake escrow, driven by a trusted `operator` (the
 *         platform's game contract or backend key).
 *
 *         Lifecycle:
 *         - `createStake`: the operator opens a match and deposits the whole
 *           pot (both players' stakes) in one call — 2×amount as msg.value
 *           for native ETH (token = address(0)), or pulled from the operator
 *           via a prior ERC20 approval.
 *         - `settleStake`: the operator pays the whole pot to the winner,
 *           minus a fee (hard-capped at MAX_FEE_BPS) that accrues in the
 *           contract's per-token `feePot`, withdrawable by the owner via
 *           `withdrawFeePot`.
 *         - `withdrawStake`: if a match hasn't been settled within
 *           WITHDRAW_DELAY (7 days), anyone can refund both players their
 *           stake — the escape hatch if the platform goes dark. Refunds go to
 *           the players directly, never back to the operator.
 *
 *         Fee-on-transfer / rebasing tokens are NOT supported: they transfer
 *         less than the pot, so payouts would drain other matches' balances.
 */
contract MatchEscrow is Ownable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- types

    enum StakeState {
        None, // never created
        Active, // pot in escrow, game on
        Settled, // winner paid
        Withdrawn // stakes refunded

    }

    struct MatchStake {
        address player1;
        address player2;
        /// @dev address(0) = native ETH.
        address token;
        /// @dev Per-player stake; the escrowed pot is 2×amount.
        uint256 amount;
        uint64 createdAt;
        StakeState state;
    }

    // ------------------------------------------------------------- constants

    /// @notice Native-ETH sentinel for `MatchStake.token`.
    address public constant NATIVE = address(0);

    /// @notice Hard cap on the platform fee: 10%.
    uint16 public constant MAX_FEE_BPS = 1000;

    uint16 private constant BPS_DENOMINATOR = 10_000;

    /// @notice Seconds after creation from which an unsettled match can be
    ///         `withdrawStake`d by anyone.
    uint256 public constant WITHDRAW_DELAY = 7 days;

    // --------------------------------------------------------------- storage

    /// @notice Fee in basis points, taken from the pot on settlement.
    uint16 public immutable feeBps;

    /// @notice The platform contract/key allowed to create and settle stakes.
    address public operator;

    mapping(bytes32 matchId => MatchStake) public stakes;

    /// @notice Accrued platform fees per token, withdrawable by the owner.
    ///         Kept separate from escrowed stakes so fee withdrawals can
    ///         never touch an unsettled match's pot.
    mapping(address token => uint256) public feePot;

    // ---------------------------------------------------------------- events

    event OperatorSet(address indexed operator);
    event StakeCreated(
        bytes32 indexed matchId,
        address indexed player1,
        address indexed player2,
        address token,
        uint256 amount
    );
    event StakeSettled(bytes32 indexed matchId, address indexed winner, uint256 payout, uint256 fee);
    event StakeWithdrawn(bytes32 indexed matchId);
    event FeePotWithdrawn(address indexed token, address indexed to, uint256 amount);

    // ---------------------------------------------------------------- errors

    error NotOperator();
    error ZeroAddress();
    error FeeTooHigh();
    error StakeAlreadyExists(bytes32 matchId);
    error InvalidPlayers();
    error InvalidStake();
    error WrongStakeState(bytes32 matchId, StakeState actual);
    error NotAPlayer(bytes32 matchId, address account);
    error WrongStakeValue(uint256 expected, uint256 actual);
    error UnexpectedValue();
    error WithdrawTooEarly(bytes32 matchId, uint256 withdrawableAt);
    error NativeTransferFailed(address to, uint256 amount);
    error InsufficientFeePot(address token, uint256 requested, uint256 available);

    // ---------------------------------------------------------- construction

    constructor(address initialOwner, address operator_, uint16 feeBps_) Ownable(initialOwner) {
        if (operator_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        operator = operator_;
        feeBps = feeBps_;
        emit OperatorSet(operator_);
    }

    modifier onlyOperator() {
        if (_msgSender() != operator) revert NotOperator();
        _;
    }

    // ----------------------------------------------------------------- admin

    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        emit OperatorSet(operator_);
    }

    // ------------------------------------------------------------- lifecycle

    /// @notice Open a match and escrow the whole pot (2×amount) from the
    ///         caller in one go: attach it as msg.value for native ETH, or
    ///         approve this contract beforehand for ERC20s.
    function createStake(bytes32 matchId, address player1, address player2, address token, uint256 amount)
        external
        payable
        onlyOperator
        nonReentrant
    {
        if (stakes[matchId].state != StakeState.None) revert StakeAlreadyExists(matchId);
        if (player1 == address(0) || player2 == address(0) || player1 == player2) {
            revert InvalidPlayers();
        }
        if (amount == 0) revert InvalidStake();

        stakes[matchId] = MatchStake({
            player1: player1,
            player2: player2,
            token: token,
            amount: amount,
            createdAt: uint64(block.timestamp),
            state: StakeState.Active
        });

        uint256 pot = amount * 2;
        if (token == NATIVE) {
            if (_msgValue() != pot) revert WrongStakeValue(pot, _msgValue());
        } else {
            if (_msgValue() != 0) revert UnexpectedValue();
            IERC20(token).safeTransferFrom(_msgSender(), address(this), pot);
        }

        emit StakeCreated(matchId, player1, player2, token, amount);
    }

    /// @notice Pay the winner the whole pot minus the fee, which stays in the
    ///         contract and accrues to the owner-withdrawable `feePot`.
    function settleStake(bytes32 matchId, address winner) external onlyOperator nonReentrant {
        MatchStake storage s = stakes[matchId];
        if (s.state != StakeState.Active) revert WrongStakeState(matchId, s.state);
        if (winner != s.player1 && winner != s.player2) revert NotAPlayer(matchId, winner);

        s.state = StakeState.Settled;

        uint256 pot = s.amount * 2;
        uint256 fee = (pot * feeBps) / BPS_DENOMINATOR;
        if (fee > 0) {
            feePot[s.token] += fee;
        }
        _payout(s.token, winner, pot - fee);
        emit StakeSettled(matchId, winner, pot - fee, fee);
    }

    /// @notice Withdraw accrued platform fees. Capped at what settlements
    ///         have actually accrued, so escrowed stakes are untouchable.
    function withdrawFeePot(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 available = feePot[token];
        if (amount > available) revert InsufficientFeePot(token, amount, available);

        feePot[token] = available - amount;
        _payout(token, to, amount);
        emit FeePotWithdrawn(token, to, amount);
    }

    /// @notice Refund a match the platform never settled: once WITHDRAW_DELAY
    ///         has passed since creation, anyone can return each player's
    ///         stake to them directly.
    function withdrawStake(bytes32 matchId) external nonReentrant {
        MatchStake storage s = stakes[matchId];
        if (s.state != StakeState.Active) revert WrongStakeState(matchId, s.state);
        uint256 withdrawableAt = uint256(s.createdAt) + WITHDRAW_DELAY;
        if (block.timestamp < withdrawableAt) revert WithdrawTooEarly(matchId, withdrawableAt);

        s.state = StakeState.Withdrawn;

        _payout(s.token, s.player1, s.amount);
        _payout(s.token, s.player2, s.amount);
        emit StakeWithdrawn(matchId);
    }

    // ------------------------------------------------------------- internals

    /// @dev `_msgSender()`-style accessor for msg.value, overridable if the
    ///      escrow is ever put behind a meta-transaction forwarder.
    function _msgValue() internal view virtual returns (uint256) {
        return msg.value;
    }

    function _payout(address token, address to, uint256 amount) private {
        if (token == NATIVE) {
            (bool ok,) = to.call{ value: amount }("");
            if (!ok) revert NativeTransferFailed(to, amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
