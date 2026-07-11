// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/**
 * @title MatchEscrow (v2)
 * @notice Escrows both players' stakes for a 1v1 match and pays the winner
 *         (minus the platform fee) when the operator settles it.
 *
 *         Trust model: the platform's `operator` key creates, funds and
 *         settles matches, but the contract caps what a compromised operator
 *         can do — escrowed stakes only ever move to one of the two staked
 *         players (settle / void), and the fee slice (hard-capped at
 *         MAX_FEE_BPS) accrues to the owner-withdrawable `feePot`. If the
 *         platform goes dark, anyone can `withdrawStake` an unsettled match
 *         after WITHDRAW_DELAY and both players are refunded in full.
 *
 *         Stakes are pulled from the players themselves (never fronted by
 *         the operator). Funding paths per token type:
 *         - EIP-2612 tokens (USDC, KOMBAT): `openWithPermits` — one operator
 *           tx creates the match and pulls both stakes with gasless permit
 *           signatures; player wallets never need ETH.
 *         - Plain ERC20s without permit: `createMatch` + `fund`, after the
 *           player wallet has approved the escrow.
 *         - Native ETH (token = address(0)): `createMatch` + each player
 *           wallet calls `fundNative` with the stake attached.
 *
 *         Fee-on-transfer / rebasing tokens are NOT supported — the owner
 *         must only allowlist tokens that transfer exact amounts.
 */
contract MatchEscrow is Ownable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- types

    enum StakeState {
        None, // never created
        Created, // declared, waiting for stakes
        Active, // both stakes in escrow, game on
        Settled, // winner paid
        Voided // stakes refunded

    }

    struct MatchStake {
        address player1;
        address player2;
        /// @dev address(0) = native ETH.
        address token;
        /// @dev Per-player stake; the escrowed pot is 2×amount once Active.
        uint256 amount;
        uint64 createdAt;
        StakeState state;
        bool player1Funded;
        bool player2Funded;
    }

    /// @dev An EIP-2612 permit signature authorizing the escrow to pull `amount`.
    struct PermitSig {
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    // ------------------------------------------------------------- constants

    /// @notice Native-ETH sentinel for `MatchStake.token`.
    address public constant NATIVE = address(0);

    /// @notice Hard cap on the platform fee: 10%.
    uint16 public constant MAX_FEE_BPS = 1000;

    uint16 private constant BPS_DENOMINATOR = 10_000;

    /// @notice Seconds after creation from which an unsettled match can be
    ///         `withdrawStake`d by anyone (the players-get-refunded escape hatch).
    uint256 public constant WITHDRAW_DELAY = 7 days;

    // --------------------------------------------------------------- storage

    /// @notice The platform's hot key: creates, funds and settles matches.
    address public operator;

    /// @notice Fee in basis points, taken from the pot on settlement.
    ///         Owner-updatable, capped at MAX_FEE_BPS.
    uint16 public feeBps;

    /// @notice Stake tokens the owner has approved (NATIVE included explicitly).
    mapping(address token => bool) public allowedTokens;

    mapping(bytes32 matchId => MatchStake) public stakes;

    /// @notice Accrued platform fees per token, withdrawable by the owner.
    ///         Kept separate from escrowed stakes so fee withdrawals can
    ///         never touch an unsettled match's pot.
    mapping(address token => uint256) public feePot;

    // ---------------------------------------------------------------- events

    event OperatorSet(address indexed operator);
    event FeeBpsSet(uint16 feeBps);
    event TokenAllowed(address indexed token, bool allowed);
    event MatchCreated(
        bytes32 indexed matchId,
        address indexed player1,
        address indexed player2,
        address token,
        uint256 amount
    );
    event StakeFunded(bytes32 indexed matchId, address indexed player);
    event MatchActivated(bytes32 indexed matchId);
    event StakeSettled(bytes32 indexed matchId, address indexed winner, uint256 payout, uint256 fee);
    event StakeVoided(bytes32 indexed matchId);
    event FeePotWithdrawn(address indexed token, address indexed to, uint256 amount);

    // ---------------------------------------------------------------- errors

    error NotOperator();
    error ZeroAddress();
    error FeeTooHigh();
    error TokenNotAllowed(address token);
    error StakeAlreadyExists(bytes32 matchId);
    error StakeNotFound(bytes32 matchId);
    error InvalidPlayers();
    error InvalidStake();
    error WrongStakeState(bytes32 matchId, StakeState actual);
    error NotAPlayer(bytes32 matchId, address account);
    error AlreadyFunded(bytes32 matchId, address player);
    error NotNativeStake(bytes32 matchId);
    error NativeStake(bytes32 matchId);
    error WrongStakeValue(uint256 expected, uint256 actual);
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
        emit FeeBpsSet(feeBps_);
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

    function setFeeBps(uint16 feeBps_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = feeBps_;
        emit FeeBpsSet(feeBps_);
    }

    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        allowedTokens[token] = allowed;
        emit TokenAllowed(token, allowed);
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

    // ------------------------------------------------------------- lifecycle

    /// @notice Declare a match. Stakes arrive via the fund* paths; the match
    ///         activates once both are in.
    function createMatch(bytes32 matchId, address player1, address player2, address token, uint256 amount)
        public
        onlyOperator
    {
        if (stakes[matchId].state != StakeState.None) revert StakeAlreadyExists(matchId);
        if (player1 == address(0) || player2 == address(0) || player1 == player2) {
            revert InvalidPlayers();
        }
        if (!allowedTokens[token]) revert TokenNotAllowed(token);
        if (amount == 0) revert InvalidStake();

        stakes[matchId] = MatchStake({
            player1: player1,
            player2: player2,
            token: token,
            amount: amount,
            createdAt: uint64(block.timestamp),
            state: StakeState.Created,
            player1Funded: false,
            player2Funded: false
        });
        emit MatchCreated(matchId, player1, player2, token, amount);
    }

    /// @notice Primary path for permit tokens (USDC, KOMBAT): create the match
    ///         and pull both stakes in one transaction. All-or-nothing — if
    ///         either player can't cover the stake, everything reverts.
    function openWithPermits(
        bytes32 matchId,
        address player1,
        address player2,
        address token,
        uint256 amount,
        PermitSig calldata sig1,
        PermitSig calldata sig2
    ) external onlyOperator {
        createMatch(matchId, player1, player2, token, amount);
        _fundWithPermit(matchId, player1, sig1);
        _fundWithPermit(matchId, player2, sig2);
    }

    /// @notice Pull a player's stake using an EIP-2612 permit signature.
    function fundWithPermit(bytes32 matchId, address player, PermitSig calldata sig)
        external
        onlyOperator
    {
        _fundWithPermit(matchId, player, sig);
    }

    /// @notice Pull a player's stake via a pre-existing ERC20 allowance
    ///         (fallback for allowlisted tokens without permit).
    function fund(bytes32 matchId, address player) external onlyOperator {
        MatchStake storage s = _requireFundable(matchId, player);
        if (s.token == NATIVE) revert NativeStake(matchId);
        _markFunded(matchId, s, player);
        IERC20(s.token).safeTransferFrom(player, address(this), s.amount);
    }

    /// @notice Stake native ETH. Called by the player wallet itself with the
    ///         exact stake attached (the wallet holds the ETH being staked, so
    ///         it can also cover its own gas).
    function fundNative(bytes32 matchId) external payable nonReentrant {
        MatchStake storage s = _requireFundable(matchId, msg.sender);
        if (s.token != NATIVE) revert NotNativeStake(matchId);
        if (_msgValue() != s.amount) revert WrongStakeValue(s.amount, _msgValue());
        _markFunded(matchId, s, msg.sender);
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

    /// @notice Void a match immediately (cancelled, funding failed halfway,
    ///         or ended with no winner). Refunds whoever has funded.
    function voidStake(bytes32 matchId) external onlyOperator nonReentrant {
        _void(matchId);
    }

    /// @notice Escape hatch: once a match has sat unsettled past
    ///         WITHDRAW_DELAY, anyone can void it and refund the players.
    ///         This is what makes stakes recoverable if the platform goes dark.
    function withdrawStake(bytes32 matchId) external nonReentrant {
        MatchStake storage s = stakes[matchId];
        uint256 withdrawableAt = uint256(s.createdAt) + WITHDRAW_DELAY;
        if (block.timestamp < withdrawableAt) revert WithdrawTooEarly(matchId, withdrawableAt);
        _void(matchId);
    }

    // ------------------------------------------------------------- internals

    function _fundWithPermit(bytes32 matchId, address player, PermitSig calldata sig) private {
        MatchStake storage s = _requireFundable(matchId, player);
        if (s.token == NATIVE) revert NativeStake(matchId);
        _markFunded(matchId, s, player);

        // A permit can be consumed by a front-runner before this call lands;
        // tolerate that and let transferFrom check the resulting allowance.
        try IERC20Permit(s.token).permit(
            player, address(this), s.amount, sig.deadline, sig.v, sig.r, sig.s
        ) { } catch { }
        IERC20(s.token).safeTransferFrom(player, address(this), s.amount);
    }

    /// @dev Shared funding guards: match exists, is awaiting stakes, `player`
    ///      is one of its players and hasn't funded yet.
    function _requireFundable(bytes32 matchId, address player)
        private
        view
        returns (MatchStake storage s)
    {
        s = stakes[matchId];
        if (s.state == StakeState.None) revert StakeNotFound(matchId);
        if (s.state != StakeState.Created) revert WrongStakeState(matchId, s.state);
        if (player != s.player1 && player != s.player2) revert NotAPlayer(matchId, player);
        bool isPlayer1 = player == s.player1;
        if (isPlayer1 ? s.player1Funded : s.player2Funded) revert AlreadyFunded(matchId, player);
    }

    function _markFunded(bytes32 matchId, MatchStake storage s, address player) private {
        if (player == s.player1) {
            s.player1Funded = true;
        } else {
            s.player2Funded = true;
        }
        emit StakeFunded(matchId, player);
        if (s.player1Funded && s.player2Funded) {
            s.state = StakeState.Active;
            emit MatchActivated(matchId);
        }
    }

    function _void(bytes32 matchId) private {
        MatchStake storage s = stakes[matchId];
        if (s.state != StakeState.Created && s.state != StakeState.Active) {
            revert WrongStakeState(matchId, s.state);
        }
        s.state = StakeState.Voided;

        if (s.player1Funded) {
            _payout(s.token, s.player1, s.amount);
        }
        if (s.player2Funded) {
            _payout(s.token, s.player2, s.amount);
        }
        emit StakeVoided(matchId);
    }

    function _payout(address token, address to, uint256 amount) private {
        if (token == NATIVE) {
            (bool ok,) = to.call{ value: amount }("");
            if (!ok) revert NativeTransferFailed(to, amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    /// @dev `_msgSender()`-style accessor for msg.value, overridable if the
    ///      escrow is ever put behind a meta-transaction forwarder.
    function _msgValue() internal view virtual returns (uint256) {
        return msg.value;
    }
}
