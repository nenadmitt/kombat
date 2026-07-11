// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { KombatCoin } from "../src/KombatCoin.sol";
import { MatchEscrow } from "../src/MatchEscrow.sol";
import { MockUSDC } from "../src/MockUSDC.sol";
import { MockUSDT } from "./mocks/MockUSDT.sol";

contract MatchEscrowTest is Test {
    KombatCoin internal kc;
    MockUSDC internal usdc;
    MockUSDT internal usdt;
    MatchEscrow internal escrow;

    address internal owner = makeAddr("owner");
    address internal operator = makeAddr("operator");

    address internal alice;
    uint256 internal alicePk;
    address internal bob;
    uint256 internal bobPk;

    uint16 internal constant FEE_BPS = 500; // 5%
    uint256 internal constant STAKE = 10 ether;
    bytes32 internal constant MATCH_ID = keccak256("room-1");

    function setUp() public {
        (alice, alicePk) = makeAddrAndKey("alice");
        (bob, bobPk) = makeAddrAndKey("bob");

        kc = new KombatCoin(owner);
        usdc = new MockUSDC();
        usdt = new MockUSDT();
        escrow = new MatchEscrow(owner, operator, FEE_BPS);

        address native = escrow.NATIVE();
        vm.startPrank(owner);
        escrow.setTokenAllowed(address(kc), true);
        escrow.setTokenAllowed(address(usdc), true);
        escrow.setTokenAllowed(address(usdt), true);
        escrow.setTokenAllowed(native, true);
        // KC has a fixed supply minted to the owner — hand the players theirs.
        kc.transfer(alice, 100 ether);
        kc.transfer(bob, 100 ether);
        vm.stopPrank();

        vm.prank(alice);
        usdc.faucet(100e6);
        vm.prank(bob);
        usdc.faucet(100e6);
        usdt.mint(alice, 100e6);
        usdt.mint(bob, 100e6);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    // ------------------------------------------------------------- helpers

    /** Build an EIP-2612 permit for any ERC20Permit token. Computed BEFORE
     *  vm.prank/expectRevert call sites — the staticcalls in here (nonces,
     *  DOMAIN_SEPARATOR) would consume single-use cheatcodes otherwise. */
    function _permit(address token, uint256 pk, address player, uint256 value)
        internal
        view
        returns (MatchEscrow.PermitSig memory)
    {
        IERC20Permit permitToken = IERC20Permit(token);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                player,
                address(escrow),
                value,
                permitToken.nonces(player),
                deadline
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", permitToken.DOMAIN_SEPARATOR(), structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return MatchEscrow.PermitSig({ deadline: deadline, v: v, r: r, s: s });
    }

    function _openKcMatch() internal {
        MatchEscrow.PermitSig memory sigA = _permit(address(kc), alicePk, alice, STAKE);
        MatchEscrow.PermitSig memory sigB = _permit(address(kc), bobPk, bob, STAKE);
        vm.prank(operator);
        escrow.openWithPermits(MATCH_ID, alice, bob, address(kc), STAKE, sigA, sigB);
    }

    function _state(bytes32 matchId) internal view returns (MatchEscrow.StakeState state) {
        (,,,,, state,,) = escrow.stakes(matchId);
    }

    // ----------------------------------------------------- open with permits

    function test_OpenWithPermits_PullsBothStakesAndActivates() public {
        _openKcMatch();

        assertEq(kc.balanceOf(address(escrow)), STAKE * 2);
        assertEq(kc.balanceOf(alice), 90 ether);
        assertEq(kc.balanceOf(bob), 90 ether);
        assertEq(uint8(_state(MATCH_ID)), uint8(MatchEscrow.StakeState.Active));
    }

    function test_OpenWithPermits_UsdcSixDecimals() public {
        uint256 stake = 10e6;
        MatchEscrow.PermitSig memory sigA = _permit(address(usdc), alicePk, alice, stake);
        MatchEscrow.PermitSig memory sigB = _permit(address(usdc), bobPk, bob, stake);
        vm.prank(operator);
        escrow.openWithPermits(MATCH_ID, alice, bob, address(usdc), stake, sigA, sigB);

        assertEq(usdc.balanceOf(address(escrow)), stake * 2);
        assertEq(uint8(_state(MATCH_ID)), uint8(MatchEscrow.StakeState.Active));
    }

    function test_OpenWithPermits_RevertsForNonOperator() public {
        MatchEscrow.PermitSig memory sigA = _permit(address(kc), alicePk, alice, STAKE);
        MatchEscrow.PermitSig memory sigB = _permit(address(kc), bobPk, bob, STAKE);
        vm.expectRevert(MatchEscrow.NotOperator.selector);
        escrow.openWithPermits(MATCH_ID, alice, bob, address(kc), STAKE, sigA, sigB);
    }

    function test_OpenWithPermits_AllOrNothingWhenOnePlayerCantPay() public {
        // Bob sends his KC away; his transferFrom must fail and revert the
        // whole open — alice keeps her stake too.
        vm.prank(bob);
        kc.transfer(address(0xD00D), 100 ether);

        MatchEscrow.PermitSig memory sigA = _permit(address(kc), alicePk, alice, STAKE);
        MatchEscrow.PermitSig memory sigB = _permit(address(kc), bobPk, bob, STAKE);
        vm.prank(operator);
        vm.expectRevert();
        escrow.openWithPermits(MATCH_ID, alice, bob, address(kc), STAKE, sigA, sigB);

        assertEq(kc.balanceOf(alice), 100 ether);
        assertEq(uint8(_state(MATCH_ID)), uint8(MatchEscrow.StakeState.None));
    }

    function test_OpenWithPermits_SurvivesFrontRunPermitConsumption() public {
        // A griefer lifts alice's permit from the mempool and lands it first.
        MatchEscrow.PermitSig memory sigA = _permit(address(kc), alicePk, alice, STAKE);
        kc.permit(alice, address(escrow), STAKE, sigA.deadline, sigA.v, sigA.r, sigA.s);

        // The escrow's try/catch shrugs it off — allowance is already in place.
        MatchEscrow.PermitSig memory sigB = _permit(address(kc), bobPk, bob, STAKE);
        vm.prank(operator);
        escrow.openWithPermits(MATCH_ID, alice, bob, address(kc), STAKE, sigA, sigB);
        assertEq(uint8(_state(MATCH_ID)), uint8(MatchEscrow.StakeState.Active));
    }

    // ------------------------------------------------------- create guards

    function test_CreateMatch_Guards() public {
        vm.startPrank(operator);

        vm.expectRevert(MatchEscrow.InvalidPlayers.selector);
        escrow.createMatch(MATCH_ID, alice, alice, address(kc), STAKE);

        vm.expectRevert(MatchEscrow.InvalidPlayers.selector);
        escrow.createMatch(MATCH_ID, address(0), bob, address(kc), STAKE);

        vm.expectRevert(MatchEscrow.InvalidStake.selector);
        escrow.createMatch(MATCH_ID, alice, bob, address(kc), 0);

        address rogue = makeAddr("rogue-token");
        vm.expectRevert(abi.encodeWithSelector(MatchEscrow.TokenNotAllowed.selector, rogue));
        escrow.createMatch(MATCH_ID, alice, bob, rogue, STAKE);

        escrow.createMatch(MATCH_ID, alice, bob, address(kc), STAKE);
        vm.expectRevert(abi.encodeWithSelector(MatchEscrow.StakeAlreadyExists.selector, MATCH_ID));
        escrow.createMatch(MATCH_ID, alice, bob, address(kc), STAKE);

        vm.stopPrank();
    }

    // ------------------------------------------------- USDT allowance path

    function test_UsdtMatch_FundViaAllowanceAndSettle() public {
        uint256 stake = 5e6;
        vm.prank(alice);
        usdt.approve(address(escrow), stake);
        vm.prank(bob);
        usdt.approve(address(escrow), stake);

        vm.startPrank(operator);
        escrow.createMatch(MATCH_ID, alice, bob, address(usdt), stake);
        escrow.fund(MATCH_ID, alice);
        escrow.fund(MATCH_ID, bob);
        escrow.settleStake(MATCH_ID, alice);
        vm.stopPrank();

        uint256 fee = (stake * 2 * FEE_BPS) / 10_000;
        assertEq(usdt.balanceOf(alice), 100e6 - stake + (stake * 2 - fee));
        assertEq(escrow.feePot(address(usdt)), fee);
    }

    function test_Fund_RevertsWithoutAllowance() public {
        vm.startPrank(operator);
        escrow.createMatch(MATCH_ID, alice, bob, address(usdt), 5e6);
        vm.expectRevert();
        escrow.fund(MATCH_ID, alice);
        vm.stopPrank();
    }

    // ----------------------------------------------------------- native ETH

    function test_NativeMatch_FullLifecycle() public {
        address native = escrow.NATIVE();
        vm.prank(operator);
        escrow.createMatch(MATCH_ID, alice, bob, native, STAKE);

        vm.prank(alice);
        escrow.fundNative{ value: STAKE }(MATCH_ID);
        vm.prank(bob);
        escrow.fundNative{ value: STAKE }(MATCH_ID);
        assertEq(address(escrow).balance, STAKE * 2);
        assertEq(uint8(_state(MATCH_ID)), uint8(MatchEscrow.StakeState.Active));

        vm.prank(operator);
        escrow.settleStake(MATCH_ID, alice);

        uint256 fee = (STAKE * 2 * FEE_BPS) / 10_000;
        assertEq(alice.balance, 100 ether - STAKE + (STAKE * 2 - fee));
        assertEq(address(escrow).balance, fee);
        assertEq(escrow.feePot(native), fee);
    }

    function test_FundNative_Guards() public {
        address native = escrow.NATIVE();
        vm.prank(operator);
        escrow.createMatch(MATCH_ID, alice, bob, native, STAKE);

        // wrong value
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(MatchEscrow.WrongStakeValue.selector, STAKE, STAKE - 1)
        );
        escrow.fundNative{ value: STAKE - 1 }(MATCH_ID);

        // not a player
        address stranger = makeAddr("stranger");
        vm.deal(stranger, STAKE);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(MatchEscrow.NotAPlayer.selector, MATCH_ID, stranger));
        escrow.fundNative{ value: STAKE }(MATCH_ID);

        // double fund
        vm.prank(alice);
        escrow.fundNative{ value: STAKE }(MATCH_ID);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MatchEscrow.AlreadyFunded.selector, MATCH_ID, alice));
        escrow.fundNative{ value: STAKE }(MATCH_ID);
    }

    function test_TokenKindMismatches() public {
        address native = escrow.NATIVE();
        vm.startPrank(operator);
        escrow.createMatch(MATCH_ID, alice, bob, native, STAKE);
        // ERC20 funding paths on a native match
        vm.expectRevert(abi.encodeWithSelector(MatchEscrow.NativeStake.selector, MATCH_ID));
        escrow.fund(MATCH_ID, alice);

        bytes32 kcMatch = keccak256("room-2");
        escrow.createMatch(kcMatch, alice, bob, address(kc), STAKE);
        vm.stopPrank();

        // native funding on an ERC20 match
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(MatchEscrow.NotNativeStake.selector, kcMatch));
        escrow.fundNative{ value: STAKE }(kcMatch);
    }

    // ---------------------------------------------------------------- settle

    function test_SettleStake_PaysWinnerMinusFeeAndAccruesFeePot() public {
        _openKcMatch();

        vm.prank(operator);
        escrow.settleStake(MATCH_ID, bob);

        uint256 pot = STAKE * 2;
        uint256 fee = (pot * FEE_BPS) / 10_000; // 1 ether
        assertEq(kc.balanceOf(bob), 90 ether + pot - fee);
        // The fee stays on the contract, accrued to the owner's fee pot.
        assertEq(kc.balanceOf(address(escrow)), fee);
        assertEq(escrow.feePot(address(kc)), fee);
        assertEq(uint8(_state(MATCH_ID)), uint8(MatchEscrow.StakeState.Settled));
    }

    function test_SettleStake_Reverts() public {
        _openKcMatch();

        // not the operator
        vm.expectRevert(MatchEscrow.NotOperator.selector);
        escrow.settleStake(MATCH_ID, alice);

        // winner must be a player
        address stranger = makeAddr("stranger");
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(MatchEscrow.NotAPlayer.selector, MATCH_ID, stranger)
        );
        escrow.settleStake(MATCH_ID, stranger);

        // double settle
        vm.prank(operator);
        escrow.settleStake(MATCH_ID, alice);
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                MatchEscrow.WrongStakeState.selector, MATCH_ID, MatchEscrow.StakeState.Settled
            )
        );
        escrow.settleStake(MATCH_ID, alice);
    }

    function test_SettleStake_RevertsWhileOnlyPartiallyFunded() public {
        MatchEscrow.PermitSig memory sigA = _permit(address(kc), alicePk, alice, STAKE);
        vm.startPrank(operator);
        escrow.createMatch(MATCH_ID, alice, bob, address(kc), STAKE);
        escrow.fundWithPermit(MATCH_ID, alice, sigA);

        vm.expectRevert(
            abi.encodeWithSelector(
                MatchEscrow.WrongStakeState.selector, MATCH_ID, MatchEscrow.StakeState.Created
            )
        );
        escrow.settleStake(MATCH_ID, alice);
        vm.stopPrank();
    }

    // ------------------------------------------------------------- fee admin

    function test_SetFeeBps_OwnerUpdatesAndAppliesAtSettleTime() public {
        _openKcMatch();

        // Owner drops the fee to 1% before settlement — the new rate applies.
        vm.prank(owner);
        escrow.setFeeBps(100);

        vm.prank(operator);
        escrow.settleStake(MATCH_ID, alice);

        uint256 fee = (STAKE * 2 * 100) / 10_000; // 0.2 ether
        assertEq(kc.balanceOf(alice), 90 ether + STAKE * 2 - fee);
        assertEq(escrow.feePot(address(kc)), fee);
    }

    function test_SetFeeBps_Guards() public {
        vm.prank(owner);
        vm.expectRevert(MatchEscrow.FeeTooHigh.selector);
        escrow.setFeeBps(1001);

        vm.prank(alice);
        vm.expectRevert();
        escrow.setFeeBps(100);
    }

    function test_SettleStake_ZeroFee() public {
        vm.prank(owner);
        escrow.setFeeBps(0);
        _openKcMatch();

        vm.prank(operator);
        escrow.settleStake(MATCH_ID, alice);
        assertEq(kc.balanceOf(alice), 90 ether + STAKE * 2);
        assertEq(escrow.feePot(address(kc)), 0);
    }

    // ------------------------------------------------------------ void stake

    function test_VoidStake_RefundsOnlyFundedPlayers() public {
        MatchEscrow.PermitSig memory sigA = _permit(address(kc), alicePk, alice, STAKE);
        vm.startPrank(operator);
        escrow.createMatch(MATCH_ID, alice, bob, address(kc), STAKE);
        escrow.fundWithPermit(MATCH_ID, alice, sigA);
        escrow.voidStake(MATCH_ID);
        vm.stopPrank();

        assertEq(kc.balanceOf(alice), 100 ether);
        assertEq(kc.balanceOf(bob), 100 ether);
        assertEq(uint8(_state(MATCH_ID)), uint8(MatchEscrow.StakeState.Voided));
    }

    function test_VoidStake_RefundsBothWhenActive() public {
        _openKcMatch();
        vm.prank(operator);
        escrow.voidStake(MATCH_ID);

        assertEq(kc.balanceOf(alice), 100 ether);
        assertEq(kc.balanceOf(bob), 100 ether);
        assertEq(kc.balanceOf(address(escrow)), 0);
    }

    function test_VoidStake_Guards() public {
        _openKcMatch();
        // not the operator
        vm.expectRevert(MatchEscrow.NotOperator.selector);
        escrow.voidStake(MATCH_ID);

        // settled match cannot be voided
        vm.startPrank(operator);
        escrow.settleStake(MATCH_ID, alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                MatchEscrow.WrongStakeState.selector, MATCH_ID, MatchEscrow.StakeState.Settled
            )
        );
        escrow.voidStake(MATCH_ID);
        vm.stopPrank();
    }

    // -------------------------------------------------------- withdraw stake

    function test_WithdrawStake_RefundsBothAfterDelay() public {
        _openKcMatch();

        // too early — even the players can't force it yet
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                MatchEscrow.WithdrawTooEarly.selector,
                MATCH_ID,
                block.timestamp + escrow.WITHDRAW_DELAY()
            )
        );
        escrow.withdrawStake(MATCH_ID);

        vm.warp(block.timestamp + escrow.WITHDRAW_DELAY() + 1);
        // anyone may trigger it
        vm.prank(makeAddr("anyone"));
        escrow.withdrawStake(MATCH_ID);

        assertEq(kc.balanceOf(alice), 100 ether);
        assertEq(kc.balanceOf(bob), 100 ether);
        assertEq(uint8(_state(MATCH_ID)), uint8(MatchEscrow.StakeState.Voided));
    }

    function test_WithdrawStake_RevertsOnSettledOrUnknownMatch() public {
        _openKcMatch();
        vm.prank(operator);
        escrow.settleStake(MATCH_ID, alice);

        vm.warp(block.timestamp + escrow.WITHDRAW_DELAY() + 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                MatchEscrow.WrongStakeState.selector, MATCH_ID, MatchEscrow.StakeState.Settled
            )
        );
        escrow.withdrawStake(MATCH_ID);

        bytes32 ghost = keccak256("ghost");
        vm.expectRevert(
            abi.encodeWithSelector(
                MatchEscrow.WrongStakeState.selector, ghost, MatchEscrow.StakeState.None
            )
        );
        escrow.withdrawStake(ghost);
    }

    // ------------------------------------------------------- withdrawFeePot

    function test_WithdrawFeePot_Erc20() public {
        _openKcMatch();
        vm.prank(operator);
        escrow.settleStake(MATCH_ID, alice);
        uint256 fee = escrow.feePot(address(kc));

        address sink = makeAddr("sink");
        vm.prank(owner);
        escrow.withdrawFeePot(address(kc), sink, fee);

        assertEq(kc.balanceOf(sink), fee);
        assertEq(escrow.feePot(address(kc)), 0);
        assertEq(kc.balanceOf(address(escrow)), 0);
    }

    function test_WithdrawFeePot_NativePartial() public {
        address native = escrow.NATIVE();
        vm.prank(operator);
        escrow.createMatch(MATCH_ID, alice, bob, native, STAKE);
        vm.prank(alice);
        escrow.fundNative{ value: STAKE }(MATCH_ID);
        vm.prank(bob);
        escrow.fundNative{ value: STAKE }(MATCH_ID);
        vm.prank(operator);
        escrow.settleStake(MATCH_ID, alice);
        uint256 fee = escrow.feePot(native);

        vm.prank(owner);
        escrow.withdrawFeePot(native, owner, fee / 2);

        assertEq(owner.balance, fee / 2);
        assertEq(escrow.feePot(native), fee - fee / 2);
    }

    function test_WithdrawFeePot_CannotTouchEscrowedStakes() public {
        // An active (unsettled) match holds 2×STAKE, but none of it is fees.
        _openKcMatch();

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(MatchEscrow.InsufficientFeePot.selector, address(kc), 1, 0)
        );
        escrow.withdrawFeePot(address(kc), owner, 1);
    }

    function test_WithdrawFeePot_Guards() public {
        _openKcMatch();
        vm.prank(operator);
        escrow.settleStake(MATCH_ID, alice);
        uint256 fee = escrow.feePot(address(kc));

        // only the owner
        vm.prank(operator);
        vm.expectRevert();
        escrow.withdrawFeePot(address(kc), operator, fee);

        // no zero recipient
        vm.prank(owner);
        vm.expectRevert(MatchEscrow.ZeroAddress.selector);
        escrow.withdrawFeePot(address(kc), address(0), fee);

        // no over-withdrawal
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                MatchEscrow.InsufficientFeePot.selector, address(kc), fee + 1, fee
            )
        );
        escrow.withdrawFeePot(address(kc), owner, fee + 1);
    }

    // ------------------------------------------------------------------ admin

    function test_Constructor_Guards() public {
        vm.expectRevert(MatchEscrow.FeeTooHigh.selector);
        new MatchEscrow(owner, operator, 1001);

        vm.expectRevert(MatchEscrow.ZeroAddress.selector);
        new MatchEscrow(owner, address(0), FEE_BPS);
    }

    function test_SetOperator() public {
        address next = makeAddr("next-operator");
        vm.prank(owner);
        escrow.setOperator(next);
        assertEq(escrow.operator(), next);

        vm.prank(alice);
        vm.expectRevert();
        escrow.setOperator(alice);
    }

    // -------------------------------------------------------------- MockUSDC

    function test_MockUsdc_FaucetAndDecimals() public {
        assertEq(usdc.decimals(), 6);
        assertEq(usdc.balanceOf(alice), 100e6);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                MockUSDC.FaucetAmountTooLarge.selector, 10_001e6, 10_000e6
            )
        );
        usdc.faucet(10_001e6);
    }
}
