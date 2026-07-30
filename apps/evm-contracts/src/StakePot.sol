// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/**
 * @title StakePot
 * @notice A pooled stake balance: players deposit once, then play any number of
 *         staked matches without touching the chain again. Matches settle in the
 *         platform's off-chain ledger; this contract only holds the pooled
 *         tokens and records attributable deposits and operator withdrawals.
 *
 *         It keeps no per-user balances on purpose. It cannot know a match
 *         result, so it cannot validate a withdrawal amount - the server ledger
 *         is the authority, and the tying invariant
 *         (holdings == ledger balances + in-flight withdrawals) is asserted by
 *         the server's reconciliation job.
 *
 *         Trust model: this is custody. A compromised `operator` can withdraw
 *         pooled funds anywhere, so the contract bounds the damage instead of
 *         preventing it - `dailyWithdrawLimit` caps payouts per token per
 *         rolling 24h, and the owner (a cold key) can `setPaused` to freeze
 *         everything. Owner and operator must be different keys.
 *
 *         Anyone may deposit for any `beneficiary`, which keeps topping up from
 *         an external wallet open. `stakeWithPermit` is the primary path (one
 *         tx, permit signed on the player's device).
 *
 *         Fee-on-transfer / rebasing tokens are NOT supported: `Staked` carries
 *         the requested value, which is what the ledger credits.
 */
contract StakePot is Ownable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- types

    /// @dev An EIP-2612 permit signature authorizing this pot to pull `value`.
    struct PermitSig {
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /// @dev Rolling withdrawal window per token, for `dailyWithdrawLimit`.
    struct WithdrawWindow {
        uint64 startedAt;
        uint256 withdrawn;
    }

    // ------------------------------------------------------------- constants

    /// @notice Native-ETH sentinel for the `token` parameters.
    address public constant NATIVE = address(0);

    /// @notice Length of the rolling window `dailyWithdrawLimit` applies to.
    uint256 public constant WITHDRAW_WINDOW = 1 days;

    // --------------------------------------------------------------- storage

    /// @notice The platform's hot key: the only account that can withdraw.
    address public operator;

    /// @notice Blocks deposits and withdrawals. The emergency brake for a
    ///         suspected operator compromise - held by the owner (cold) key.
    bool public paused;

    /// @notice Deposit tokens the owner has approved (NATIVE included explicitly).
    mapping(address token => bool) public allowedTokens;

    /// @notice Max withdrawable per token per WITHDRAW_WINDOW. 0 = unlimited.
    mapping(address token => uint256) public dailyWithdrawLimit;

    /// @notice Rolling withdrawal usage per token. Tracked even when the
    ///         token is unlimited, so turning a limit on mid-window doesn't
    ///         hand out a fresh allowance.
    mapping(address token => WithdrawWindow) public withdrawWindow;

    /// @notice Withdrawal ids already paid out. This is what makes the
    ///         server's "did my tx land before I crashed?" retry safe: a
    ///         replayed id reverts instead of paying twice.
    mapping(bytes32 withdrawalId => bool) public processedWithdrawals;

    // ---------------------------------------------------------------- events

    event OperatorSet(address indexed operator);
    event PausedSet(bool paused);
    event TokenAllowed(address indexed token, bool allowed);
    event DailyWithdrawLimitSet(address indexed token, uint256 limit);
    /// @dev `sender` is who paid; `beneficiary` is whose ledger gets credited.
    event Staked(
        address indexed beneficiary, address indexed token, uint256 value, address sender
    );
    event Withdrawn(
        bytes32 indexed withdrawalId, address indexed to, address indexed token, uint256 value
    );

    // ---------------------------------------------------------------- errors

    error NotOperator();
    error ZeroAddress();
    error ZeroValue();
    error TokenNotAllowed(address token);
    error NativeToken();
    error IsPaused();
    error AlreadyProcessed(bytes32 withdrawalId);
    error DailyLimitExceeded(address token, uint256 requested, uint256 remaining);
    error InsufficientHoldings(address token, uint256 requested, uint256 available);
    error NativeTransferFailed(address to, uint256 amount);

    // ---------------------------------------------------------- construction

    constructor(address initialOwner, address operator_) Ownable(initialOwner) {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        emit OperatorSet(operator_);
    }

    modifier onlyOperator() {
        if (_msgSender() != operator) revert NotOperator();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert IsPaused();
        _;
    }

    // ----------------------------------------------------------------- admin

    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        emit OperatorSet(operator_);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        allowedTokens[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    /// @notice Cap withdrawals per token per rolling 24h. 0 = unlimited.
    ///         Lowering it below the current window's usage simply blocks
    ///         further withdrawals until the window rolls over.
    function setDailyWithdrawLimit(address token, uint256 limit) external onlyOwner {
        dailyWithdrawLimit[token] = limit;
        emit DailyWithdrawLimitSet(token, limit);
    }

    // -------------------------------------------------------------- deposits

    /// @notice Deposit an ERC20 the depositor has already approved.
    function stake(address beneficiary, address token, uint256 value)
        external
        whenNotPaused
        nonReentrant
    {
        if (token == NATIVE) revert NativeToken();
        _requireDepositable(beneficiary, token, value);
        IERC20(token).safeTransferFrom(_msgSender(), address(this), value);
        emit Staked(beneficiary, token, value, _msgSender());
    }

    /// @notice Deposit an EIP-2612 token in a single transaction - the mobile
    ///         app signs the permit locally, so no separate approve tx.
    function stakeWithPermit(
        address beneficiary,
        address token,
        uint256 value,
        PermitSig calldata sig
    ) external whenNotPaused nonReentrant {
        if (token == NATIVE) revert NativeToken();
        _requireDepositable(beneficiary, token, value);

        // A permit can be consumed by a front-runner before this call lands;
        // tolerate that and let transferFrom check the resulting allowance.
        try IERC20Permit(token).permit(
            _msgSender(), address(this), value, sig.deadline, sig.v, sig.r, sig.s
        ) { } catch { }
        IERC20(token).safeTransferFrom(_msgSender(), address(this), value);
        emit Staked(beneficiary, token, value, _msgSender());
    }

    /// @notice Deposit native ETH with the amount attached.
    function stakeNative(address beneficiary) external payable whenNotPaused nonReentrant {
        _requireDepositable(beneficiary, NATIVE, msg.value);
        emit Staked(beneficiary, NATIVE, msg.value, _msgSender());
    }

    // ----------------------------------------------------------- withdrawals

    /**
     * @notice Pay out `value` to `to` on the platform's authority. Used for
     *         both player withdrawals and platform fee sweeps - from this
     *         contract's point of view they are the same operation.
     * @param withdrawalId Caller-chosen unique id (the server uses the
     *        withdrawal row's uuid). Replaying an id reverts, which is what
     *        makes a resend after an uncertain outcome safe.
     */
    function withdrawTo(bytes32 withdrawalId, address to, address token, uint256 value)
        external
        onlyOperator
        whenNotPaused
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        if (value == 0) revert ZeroValue();
        if (processedWithdrawals[withdrawalId]) revert AlreadyProcessed(withdrawalId);

        uint256 available = holdings(token);
        if (value > available) revert InsufficientHoldings(token, value, available);

        processedWithdrawals[withdrawalId] = true;
        _consumeWithdrawAllowance(token, value);
        _payout(token, to, value);
        emit Withdrawn(withdrawalId, to, token, value);
    }

    /**
     * @notice Owner escape hatch: pay out without the operator.
     *
     *         Deliberately ignores `paused` and `dailyWithdrawLimit`. Both of
     *         those exist to bound a compromised *operator*, and pausing is
     *         exactly the state in which the owner needs to move funds - a
     *         brake the rescuer can't release would be no use. It grants the
     *         owner no new power either: the owner could already
     *         `setOperator(self)` and withdraw in two transactions.
     *
     *         Shares `processedWithdrawals` with the operator path so an id can
     *         never pay twice via either route.
     *
     *         This bypasses the ledger, so afterwards the ledger claims more
     *         than the contract holds and the reconciliation job will report a
     *         shortfall. That is correct: use it to rescue funds, not to run
     *         ordinary payouts or fee sweeps (those go through the server so
     *         the ledger stays balanced).
     */
    function ownerWithdrawTo(bytes32 withdrawalId, address to, address token, uint256 value)
        external
        onlyOwner
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        if (value == 0) revert ZeroValue();
        if (processedWithdrawals[withdrawalId]) revert AlreadyProcessed(withdrawalId);

        uint256 available = holdings(token);
        if (value > available) revert InsufficientHoldings(token, value, available);

        processedWithdrawals[withdrawalId] = true;
        _payout(token, to, value);
        emit Withdrawn(withdrawalId, to, token, value);
    }

    // ----------------------------------------------------------------- views

    /// @notice Pooled holdings for a token - the left-hand side of the
    ///         reconciliation invariant.
    function holdings(address token) public view returns (uint256) {
        return token == NATIVE ? address(this).balance : IERC20(token).balanceOf(address(this));
    }

    /// @notice How much more may be withdrawn for `token` in the current
    ///         window. `type(uint256).max` when the token is unlimited.
    function remainingDailyAllowance(address token) external view returns (uint256) {
        uint256 limit = dailyWithdrawLimit[token];
        if (limit == 0) return type(uint256).max;
        WithdrawWindow storage w = withdrawWindow[token];
        if (block.timestamp - w.startedAt >= WITHDRAW_WINDOW) return limit;
        return w.withdrawn >= limit ? 0 : limit - w.withdrawn;
    }

    // ------------------------------------------------------------- internals

    function _requireDepositable(address beneficiary, address token, uint256 value) private view {
        if (beneficiary == address(0)) revert ZeroAddress();
        if (value == 0) revert ZeroValue();
        if (!allowedTokens[token]) revert TokenNotAllowed(token);
    }

    function _consumeWithdrawAllowance(address token, uint256 value) private {
        WithdrawWindow storage w = withdrawWindow[token];
        if (block.timestamp - w.startedAt >= WITHDRAW_WINDOW) {
            w.startedAt = uint64(block.timestamp);
            w.withdrawn = 0;
        }
        uint256 limit = dailyWithdrawLimit[token];
        uint256 used = w.withdrawn + value;
        if (limit != 0 && used > limit) {
            // Lowering the limit mid-window can leave usage above it.
            revert DailyLimitExceeded(token, value, w.withdrawn >= limit ? 0 : limit - w.withdrawn);
        }
        w.withdrawn = used;
    }

    function _payout(address token, address to, uint256 value) private {
        if (token == NATIVE) {
            (bool ok,) = to.call{ value: value }("");
            if (!ok) revert NativeTransferFailed(to, value);
        } else {
            IERC20(token).safeTransfer(to, value);
        }
    }
}
