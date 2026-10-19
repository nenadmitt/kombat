// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @notice No per-user balances: the off-chain ledger is authoritative, so withdrawals are bounded by daily limits and pause, not validated.
contract StakePot is Ownable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    struct PermitSig {
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct WithdrawWindow {
        uint64 startedAt;
        uint256 withdrawn;
    }

    address public constant NATIVE = address(0);

    uint256 public constant WITHDRAW_WINDOW = 1 days;

    address public operator;

    bool public paused;

    mapping(address token => bool) public allowedTokens;

    /// @notice 0 = unlimited.
    mapping(address token => uint256) public dailyWithdrawLimit;

    /// @dev Tracked even when unlimited, so enabling a limit mid-window does not grant a fresh allowance.
    mapping(address token => WithdrawWindow) public withdrawWindow;

    mapping(bytes32 withdrawalId => bool) public processedWithdrawals;

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

    function setDailyWithdrawLimit(address token, uint256 limit) external onlyOwner {
        dailyWithdrawLimit[token] = limit;
        emit DailyWithdrawLimitSet(token, limit);
    }

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

    function stakeWithPermit(
        address beneficiary,
        address token,
        uint256 value,
        PermitSig calldata sig
    ) external whenNotPaused nonReentrant {
        if (token == NATIVE) revert NativeToken();
        _requireDepositable(beneficiary, token, value);

        // A front-runner may consume the permit first; transferFrom still checks the allowance.
        try IERC20Permit(token).permit(
            _msgSender(), address(this), value, sig.deadline, sig.v, sig.r, sig.s
        ) { } catch { }
        IERC20(token).safeTransferFrom(_msgSender(), address(this), value);
        emit Staked(beneficiary, token, value, _msgSender());
    }

    function stakeNative(address beneficiary) external payable whenNotPaused nonReentrant {
        _requireDepositable(beneficiary, NATIVE, msg.value);
        emit Staked(beneficiary, NATIVE, msg.value, _msgSender());
    }

    /// @dev A replayed `withdrawalId` reverts, so the server can safely resend after an uncertain outcome.
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

    /// @dev Ignores pause and daily limits on purpose: those bound the operator, and a paused pot is when the owner must rescue funds.
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

    function holdings(address token) public view returns (uint256) {
        return token == NATIVE ? address(this).balance : IERC20(token).balanceOf(address(this));
    }

    function remainingDailyAllowance(address token) external view returns (uint256) {
        uint256 limit = dailyWithdrawLimit[token];
        if (limit == 0) return type(uint256).max;
        WithdrawWindow storage w = withdrawWindow[token];
        if (block.timestamp - w.startedAt >= WITHDRAW_WINDOW) return limit;
        return w.withdrawn >= limit ? 0 : limit - w.withdrawn;
    }

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
