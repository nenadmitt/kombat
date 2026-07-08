// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { KombatCoin } from "../src/KombatCoin.sol";
import { MatchEscrow } from "../src/MatchEscrow.sol";
import { MockUSDT } from "./mocks/MockUSDT.sol";

contract MatchEscrowTest is Test {
    KombatCoin internal kc;
    MockUSDT internal usdt;
    MatchEscrow internal escrow;

    address internal owner = makeAddr("owner");
    address internal operator = makeAddr("operator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint16 internal constant FEE_BPS = 250; // 2.5%
    uint256 internal constant STAKE = 10 ether;
    bytes32 internal constant MATCH_ID = keccak256("room-1");

    function setUp() public {
        // The operator (the platform's game contract) holds the players'
        // deposits and funds the escrow itself, so KC's fixed supply goes
        // straight to it here.
        kc = new KombatCoin(operator);
        usdt = new MockUSDT();
        escrow = new MatchEscrow(owner, operator, FEE_BPS);

        usdt.mint(operator, 100e6);
        vm.deal(operator, 100 ether);

        vm.startPrank(operator);
        kc.approve(address(escrow), type(uint256).max);
        usdt.approve(address(escrow), type(uint256).max);
        vm.stopPrank();
    }

    // ------------------------------------------------------------- helpers

    function _openKcMatch() internal {
        vm.prank(operator);
        escrow.createStake(MATCH_ID, alice, bob, address(kc), STAKE);
    }

    function _state(bytes32 matchId) internal view returns (MatchEscrow.StakeState state) {
        (,,,,, state) = escrow.stakes(matchId);
    }

    // --------------------------------------------------------- createStake

    function test_CreateStake_EscrowsPotAndActivates() public {
        _openKcMatch();

        (address p1, address p2, address token, uint256 amount,, MatchEscrow.StakeState state) =
            escrow.stakes(MATCH_ID);
        assertEq(p1, alice);
        assertEq(p2, bob);
        assertEq(token, address(kc));
        assertEq(amount, STAKE);
        assertEq(uint8(state), uint8(MatchEscrow.StakeState.Active));
        assertEq(kc.balanceOf(address(escrow)), STAKE * 2);
        assertEq(kc.balanceOf(operator), kc.INITIAL_SUPPLY() - STAKE * 2);
    }

    function test_CreateStake_RevertsForNonOperator() public {
        vm.prank(alice);
        vm.expectRevert(MatchEscrow.NotOperator.selector);
        escrow.createStake(MATCH_ID, alice, bob, address(kc), STAKE);
    }

    function test_CreateStake_Guards() public {
        vm.startPrank(operator);

        vm.expectRevert(MatchEscrow.InvalidPlayers.selector);
        escrow.createStake(MATCH_ID, alice, alice, address(kc), STAKE);

        vm.expectRevert(MatchEscrow.InvalidPlayers.selector);
        escrow.createStake(MATCH_ID, address(0), bob, address(kc), STAKE);

        vm.expectRevert(MatchEscrow.InvalidStake.selector);
        escrow.createStake(MATCH_ID, alice, bob, address(kc), 0);

        escrow.createStake(MATCH_ID, alice, bob, address(kc), STAKE);
        vm.expectRevert(abi.encodeWithSelector(MatchEscrow.StakeAlreadyExists.selector, MATCH_ID));
        escrow.createStake(MATCH_ID, alice, bob, address(kc), STAKE);

        vm.stopPrank();
    }

    function test_CreateStake_RevertsWithoutAllowance() public {
        vm.startPrank(operator);
        usdt.approve(address(escrow), 0);
        vm.expectRevert();
        escrow.createStake(MATCH_ID, alice, bob, address(usdt), 5e6);
        vm.stopPrank();
    }

    function test_CreateStake_RejectsEthOnErc20Stake() public {
        vm.prank(operator);
        vm.expectRevert(MatchEscrow.UnexpectedValue.selector);
        escrow.createStake{ value: 1 ether }(MATCH_ID, alice, bob, address(kc), STAKE);
    }

    // --------------------------------------------------------- settleStake

    function test_SettleStake_PaysWinnerMinusFeeAndAccruesFeePot() public {
        _openKcMatch();

        vm.prank(operator);
        escrow.settleStake(MATCH_ID, bob);

        uint256 pot = STAKE * 2;
        uint256 fee = (pot * FEE_BPS) / 10_000; // 0.5 ether
        assertEq(kc.balanceOf(bob), pot - fee);
        // the fee stays on the contract, accrued to the owner's fee pot
        assertEq(kc.balanceOf(address(escrow)), fee);
        assertEq(escrow.feePot(address(kc)), fee);
        assertEq(kc.balanceOf(owner), 0);
        assertEq(uint8(_state(MATCH_ID)), uint8(MatchEscrow.StakeState.Settled));
    }

    function test_SettleStake_ZeroFee() public {
        escrow = new MatchEscrow(owner, operator, 0);
        vm.startPrank(operator);
        kc.approve(address(escrow), type(uint256).max);
        escrow.createStake(MATCH_ID, alice, bob, address(kc), STAKE);
        escrow.settleStake(MATCH_ID, alice);
        vm.stopPrank();

        assertEq(kc.balanceOf(alice), STAKE * 2);
        assertEq(escrow.feePot(address(kc)), 0);
    }

    function test_SettleStake_Reverts() public {
        _openKcMatch();

        // not the operator
        vm.prank(alice);
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

    // ------------------------------------------------- USDT allowance path

    function test_UsdtMatch_StakeAndSettle() public {
        uint256 stake = 5e6;
        vm.startPrank(operator);
        escrow.createStake(MATCH_ID, alice, bob, address(usdt), stake);
        escrow.settleStake(MATCH_ID, alice);
        vm.stopPrank();

        uint256 fee = (stake * 2 * FEE_BPS) / 10_000;
        assertEq(usdt.balanceOf(alice), stake * 2 - fee);
        assertEq(escrow.feePot(address(usdt)), fee);
    }

    // ----------------------------------------------------------- native ETH

    function test_NativeMatch_FullLifecycle() public {
        // `escrow.NATIVE()` in the argument list is a staticcall that would
        // consume the prank — resolve it first.
        address native = escrow.NATIVE();
        vm.prank(operator);
        escrow.createStake{ value: STAKE * 2 }(MATCH_ID, alice, bob, native, STAKE);
        assertEq(address(escrow).balance, STAKE * 2);

        vm.prank(operator);
        escrow.settleStake(MATCH_ID, alice);

        uint256 fee = (STAKE * 2 * FEE_BPS) / 10_000;
        assertEq(alice.balance, STAKE * 2 - fee);
        assertEq(address(escrow).balance, fee);
        assertEq(escrow.feePot(native), fee);
    }

    function test_CreateStake_NativeValueMustEqualPot() public {
        address native = escrow.NATIVE();
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(MatchEscrow.WrongStakeValue.selector, STAKE * 2, STAKE)
        );
        escrow.createStake{ value: STAKE }(MATCH_ID, alice, bob, native, STAKE);
    }

    // -------------------------------------------------------- withdrawStake

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
        // anyone may trigger it; refunds go to the players, not the operator
        vm.prank(makeAddr("anyone"));
        escrow.withdrawStake(MATCH_ID);

        assertEq(kc.balanceOf(alice), STAKE);
        assertEq(kc.balanceOf(bob), STAKE);
        assertEq(kc.balanceOf(address(escrow)), 0);
        assertEq(uint8(_state(MATCH_ID)), uint8(MatchEscrow.StakeState.Withdrawn));
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

    function test_WithdrawStake_CannotBeSettledAfterWithdraw() public {
        _openKcMatch();
        vm.warp(block.timestamp + escrow.WITHDRAW_DELAY() + 1);
        escrow.withdrawStake(MATCH_ID);

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                MatchEscrow.WrongStakeState.selector, MATCH_ID, MatchEscrow.StakeState.Withdrawn
            )
        );
        escrow.settleStake(MATCH_ID, alice);
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
        escrow.createStake{ value: STAKE * 2 }(MATCH_ID, alice, bob, native, STAKE);
        vm.prank(operator);
        escrow.settleStake(MATCH_ID, alice);
        uint256 fee = escrow.feePot(native);

        vm.prank(owner);
        escrow.withdrawFeePot(native, owner, fee / 2);

        assertEq(owner.balance, fee / 2);
        assertEq(escrow.feePot(native), fee - fee / 2);
    }

    function test_WithdrawFeePot_CannotTouchEscrowedStakes() public {
        // an active (unsettled) match holds 2×STAKE, but none of it is fees
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
}
