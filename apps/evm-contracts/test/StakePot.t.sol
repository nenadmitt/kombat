// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { KombatCoin } from "../src/KombatCoin.sol";
import { MockUSDC } from "../src/MockUSDC.sol";
import { StakePot } from "../src/StakePot.sol";
import { MockUSDT } from "./mocks/MockUSDT.sol";

contract ReentrantOperator {
    StakePot internal pot;
    bytes32 internal replayId;
    bool public attempted;
    bool public succeeded;

    constructor(StakePot pot_) {
        pot = pot_;
    }

    function attack(bytes32 firstId, bytes32 replayId_, uint256 value) external {
        replayId = replayId_;
        pot.withdrawTo(firstId, address(this), address(0), value);
    }

    receive() external payable {
        if (attempted) return;
        attempted = true;
        try pot.withdrawTo(replayId, address(this), address(0), 1) {
            succeeded = true;
        } catch { }
    }
}

contract RejectingReceiver {
    receive() external payable {
        revert("no thanks");
    }
}

contract StakePotTest is Test {
    KombatCoin internal kc;
    MockUSDC internal usdc;
    MockUSDT internal usdt;
    StakePot internal pot;

    address internal owner = makeAddr("owner");
    address internal operator = makeAddr("operator");
    address internal treasury = makeAddr("treasury");

    address internal alice;
    uint256 internal alicePk;
    address internal bob;
    uint256 internal bobPk;

    /// @dev Cached: calling `pot.NATIVE()` inline would consume a pending vm.prank/expectRevert.
    address internal native;

    uint256 internal constant DEPOSIT = 10 ether;
    bytes32 internal constant W1 = keccak256("withdrawal-1");
    bytes32 internal constant W2 = keccak256("withdrawal-2");

    function setUp() public {
        (alice, alicePk) = makeAddrAndKey("alice");
        (bob, bobPk) = makeAddrAndKey("bob");

        kc = new KombatCoin(owner);
        usdc = new MockUSDC();
        usdt = new MockUSDT();
        pot = new StakePot(owner, operator);
        native = pot.NATIVE();

        vm.startPrank(owner);
        pot.setTokenAllowed(address(kc), true);
        pot.setTokenAllowed(address(usdc), true);
        pot.setTokenAllowed(address(usdt), true);
        pot.setTokenAllowed(native, true);
        kc.transfer(alice, 100 ether);
        kc.transfer(bob, 100 ether);
        vm.stopPrank();

        vm.prank(alice);
        usdc.faucet(100e6);
        vm.prank(bob);
        usdc.faucet(100e6);
        usdt.mint(alice, 100e6);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    /// @dev Call before vm.prank/expectRevert: its staticcalls would consume them.
    function _permit(address token, uint256 pk, address depositor, uint256 value)
        internal
        view
        returns (StakePot.PermitSig memory)
    {
        IERC20Permit permitToken = IERC20Permit(token);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                depositor,
                address(pot),
                value,
                permitToken.nonces(depositor),
                deadline
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", permitToken.DOMAIN_SEPARATOR(), structHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return StakePot.PermitSig({ deadline: deadline, v: v, r: r, s: s });
    }

    function _depositKc(address depositor, address beneficiary, uint256 value) internal {
        vm.startPrank(depositor);
        kc.approve(address(pot), value);
        pot.stake(beneficiary, address(kc), value);
        vm.stopPrank();
    }

    function test_stake_pullsTokensAndEmits() public {
        vm.prank(alice);
        kc.approve(address(pot), DEPOSIT);

        vm.expectEmit(true, true, false, true, address(pot));
        emit StakePot.Staked(alice, address(kc), DEPOSIT, alice);

        vm.prank(alice);
        pot.stake(alice, address(kc), DEPOSIT);

        assertEq(kc.balanceOf(address(pot)), DEPOSIT);
        assertEq(kc.balanceOf(alice), 100 ether - DEPOSIT);
        assertEq(pot.holdings(address(kc)), DEPOSIT);
    }

    function test_stake_forAnotherBeneficiary() public {
        vm.startPrank(bob);
        kc.approve(address(pot), DEPOSIT);

        vm.expectEmit(true, true, false, true, address(pot));
        emit StakePot.Staked(alice, address(kc), DEPOSIT, bob);
        pot.stake(alice, address(kc), DEPOSIT);
        vm.stopPrank();

        assertEq(pot.holdings(address(kc)), DEPOSIT);
    }

    function test_stake_nonStandardErc20() public {
        vm.startPrank(alice);
        usdt.approve(address(pot), 25e6);
        pot.stake(alice, address(usdt), 25e6);
        vm.stopPrank();

        assertEq(pot.holdings(address(usdt)), 25e6);
    }

    function test_stake_revertsWithoutApproval() public {
        vm.prank(alice);
        vm.expectRevert();
        pot.stake(alice, address(kc), DEPOSIT);
    }

    function test_stake_revertsOnNativeToken() public {
        vm.prank(alice);
        vm.expectRevert(StakePot.NativeToken.selector);
        pot.stake(alice, native, DEPOSIT);
    }

    function test_stake_revertsOnDisallowedToken() public {
        MockUSDC rogue = new MockUSDC();
        vm.prank(alice);
        rogue.faucet(10e6);

        vm.startPrank(alice);
        rogue.approve(address(pot), 10e6);
        vm.expectRevert(abi.encodeWithSelector(StakePot.TokenNotAllowed.selector, address(rogue)));
        pot.stake(alice, address(rogue), 10e6);
        vm.stopPrank();
    }

    function test_stake_revertsOnZeroValue() public {
        vm.prank(alice);
        vm.expectRevert(StakePot.ZeroValue.selector);
        pot.stake(alice, address(kc), 0);
    }

    function test_stake_revertsOnZeroBeneficiary() public {
        vm.prank(alice);
        vm.expectRevert(StakePot.ZeroAddress.selector);
        pot.stake(address(0), address(kc), DEPOSIT);
    }

    function test_stake_revertsWhenPaused() public {
        vm.prank(owner);
        pot.setPaused(true);

        vm.startPrank(alice);
        kc.approve(address(pot), DEPOSIT);
        vm.expectRevert(StakePot.IsPaused.selector);
        pot.stake(alice, address(kc), DEPOSIT);
        vm.stopPrank();
    }

    function test_stakeWithPermit_singleTx() public {
        StakePot.PermitSig memory sig = _permit(address(usdc), alicePk, alice, 50e6);

        vm.prank(alice);
        pot.stakeWithPermit(alice, address(usdc), 50e6, sig);

        assertEq(pot.holdings(address(usdc)), 50e6);
        assertEq(usdc.balanceOf(alice), 50e6);
    }

    function test_stakeWithPermit_toleratesFrontRunConsumption() public {
        StakePot.PermitSig memory sig = _permit(address(usdc), alicePk, alice, 50e6);

        vm.prank(bob);
        IERC20Permit(address(usdc)).permit(
            alice, address(pot), 50e6, sig.deadline, sig.v, sig.r, sig.s
        );

        vm.prank(alice);
        pot.stakeWithPermit(alice, address(usdc), 50e6, sig);

        assertEq(pot.holdings(address(usdc)), 50e6);
    }

    function test_stakeWithPermit_revertsOnExpiredPermitWithoutAllowance() public {
        StakePot.PermitSig memory sig = _permit(address(usdc), alicePk, alice, 50e6);
        vm.warp(sig.deadline + 1);

        vm.prank(alice);
        vm.expectRevert();
        pot.stakeWithPermit(alice, address(usdc), 50e6, sig);
    }

    function test_stakeNative_credits() public {
        vm.expectEmit(true, true, false, true, address(pot));
        emit StakePot.Staked(alice, native, 1 ether, alice);

        vm.prank(alice);
        pot.stakeNative{ value: 1 ether }(alice);

        assertEq(address(pot).balance, 1 ether);
        assertEq(pot.holdings(native), 1 ether);
    }

    function test_stakeNative_revertsOnZeroValue() public {
        vm.prank(alice);
        vm.expectRevert(StakePot.ZeroValue.selector);
        pot.stakeNative{ value: 0 }(alice);
    }

    function test_stakeNative_revertsWhenNativeNotAllowed() public {
        vm.prank(owner);
        pot.setTokenAllowed(native, false);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(StakePot.TokenNotAllowed.selector, address(0)));
        pot.stakeNative{ value: 1 ether }(alice);
    }

    function test_withdrawTo_erc20() public {
        _depositKc(alice, alice, DEPOSIT);

        vm.expectEmit(true, true, true, true, address(pot));
        emit StakePot.Withdrawn(W1, alice, address(kc), 4 ether);

        vm.prank(operator);
        pot.withdrawTo(W1, alice, address(kc), 4 ether);

        assertEq(kc.balanceOf(alice), 100 ether - DEPOSIT + 4 ether);
        assertEq(pot.holdings(address(kc)), DEPOSIT - 4 ether);
        assertTrue(pot.processedWithdrawals(W1));
    }

    function test_withdrawTo_native() public {
        vm.prank(alice);
        pot.stakeNative{ value: 5 ether }(alice);
        uint256 before = alice.balance;

        vm.prank(operator);
        pot.withdrawTo(W1, alice, native, 2 ether);

        assertEq(alice.balance, before + 2 ether);
        assertEq(address(pot).balance, 3 ether);
    }

    function test_withdrawTo_feeSweepToTreasury() public {
        _depositKc(alice, alice, DEPOSIT);

        vm.prank(operator);
        pot.withdrawTo(W1, treasury, address(kc), 1 ether);

        assertEq(kc.balanceOf(treasury), 1 ether);
    }

    function test_withdrawTo_onlyOperator() public {
        _depositKc(alice, alice, DEPOSIT);

        vm.prank(owner);
        vm.expectRevert(StakePot.NotOperator.selector);
        pot.withdrawTo(W1, alice, address(kc), 1 ether);

        vm.prank(alice);
        vm.expectRevert(StakePot.NotOperator.selector);
        pot.withdrawTo(W1, alice, address(kc), 1 ether);
    }

    function test_withdrawTo_revertsWhenPaused() public {
        _depositKc(alice, alice, DEPOSIT);
        vm.prank(owner);
        pot.setPaused(true);

        vm.prank(operator);
        vm.expectRevert(StakePot.IsPaused.selector);
        pot.withdrawTo(W1, alice, address(kc), 1 ether);
    }

    function test_withdrawTo_revertsOnZeroArgs() public {
        _depositKc(alice, alice, DEPOSIT);

        vm.prank(operator);
        vm.expectRevert(StakePot.ZeroAddress.selector);
        pot.withdrawTo(W1, address(0), address(kc), 1 ether);

        vm.prank(operator);
        vm.expectRevert(StakePot.ZeroValue.selector);
        pot.withdrawTo(W1, alice, address(kc), 0);
    }

    function test_withdrawTo_revertsBeyondHoldings() public {
        _depositKc(alice, alice, DEPOSIT);

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                StakePot.InsufficientHoldings.selector, address(kc), DEPOSIT + 1, DEPOSIT
            )
        );
        pot.withdrawTo(W1, alice, address(kc), DEPOSIT + 1);
    }

    function test_withdrawTo_sameIdRevertsSecondTime() public {
        _depositKc(alice, alice, DEPOSIT);

        vm.prank(operator);
        pot.withdrawTo(W1, alice, address(kc), 1 ether);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(StakePot.AlreadyProcessed.selector, W1));
        pot.withdrawTo(W1, alice, address(kc), 1 ether);

        assertEq(pot.holdings(address(kc)), DEPOSIT - 1 ether);
    }

    function test_withdrawTo_sameIdDifferentArgsStillReverts() public {
        _depositKc(alice, alice, DEPOSIT);

        vm.prank(operator);
        pot.withdrawTo(W1, alice, address(kc), 1 ether);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(StakePot.AlreadyProcessed.selector, W1));
        pot.withdrawTo(W1, bob, address(kc), 2 ether);
    }

    function test_withdrawTo_distinctIdsPayIndependently() public {
        _depositKc(alice, alice, DEPOSIT);

        vm.startPrank(operator);
        pot.withdrawTo(W1, alice, address(kc), 1 ether);
        pot.withdrawTo(W2, bob, address(kc), 2 ether);
        vm.stopPrank();

        assertEq(pot.holdings(address(kc)), DEPOSIT - 3 ether);
        assertEq(kc.balanceOf(bob), 100 ether + 2 ether);
    }

    function test_dailyLimit_accumulatesWithinWindow() public {
        _depositKc(alice, alice, DEPOSIT);
        vm.prank(owner);
        pot.setDailyWithdrawLimit(address(kc), 3 ether);

        vm.startPrank(operator);
        pot.withdrawTo(W1, alice, address(kc), 2 ether);
        assertEq(pot.remainingDailyAllowance(address(kc)), 1 ether);

        vm.expectRevert(
            abi.encodeWithSelector(
                StakePot.DailyLimitExceeded.selector, address(kc), 2 ether, 1 ether
            )
        );
        pot.withdrawTo(W2, alice, address(kc), 2 ether);

        pot.withdrawTo(W2, alice, address(kc), 1 ether);
        assertEq(pot.remainingDailyAllowance(address(kc)), 0);
        vm.stopPrank();
    }

    function test_dailyLimit_rollsOverAfterWindow() public {
        _depositKc(alice, alice, DEPOSIT);
        vm.prank(owner);
        pot.setDailyWithdrawLimit(address(kc), 3 ether);

        vm.prank(operator);
        pot.withdrawTo(W1, alice, address(kc), 3 ether);

        vm.warp(block.timestamp + pot.WITHDRAW_WINDOW());
        assertEq(pot.remainingDailyAllowance(address(kc)), 3 ether);

        vm.prank(operator);
        pot.withdrawTo(W2, alice, address(kc), 3 ether);
        assertEq(pot.holdings(address(kc)), DEPOSIT - 6 ether);
    }

    function test_dailyLimit_isPerToken() public {
        _depositKc(alice, alice, DEPOSIT);
        vm.prank(alice);
        pot.stakeNative{ value: 5 ether }(alice);

        vm.startPrank(owner);
        pot.setDailyWithdrawLimit(address(kc), 1 ether);
        pot.setDailyWithdrawLimit(native, 5 ether);
        vm.stopPrank();

        vm.startPrank(operator);
        pot.withdrawTo(W1, alice, address(kc), 1 ether);
        pot.withdrawTo(W2, alice, native, 5 ether);
        vm.stopPrank();
    }

    function test_dailyLimit_zeroMeansUnlimited() public {
        _depositKc(alice, alice, DEPOSIT);
        assertEq(pot.remainingDailyAllowance(address(kc)), type(uint256).max);

        vm.prank(operator);
        pot.withdrawTo(W1, alice, address(kc), DEPOSIT);
        assertEq(pot.holdings(address(kc)), 0);
    }

    function test_dailyLimit_loweredBelowUsageBlocksUntilRollover() public {
        _depositKc(alice, alice, DEPOSIT);
        vm.prank(owner);
        pot.setDailyWithdrawLimit(address(kc), 5 ether);

        vm.prank(operator);
        pot.withdrawTo(W1, alice, address(kc), 4 ether);

        vm.prank(owner);
        pot.setDailyWithdrawLimit(address(kc), 1 ether);
        assertEq(pot.remainingDailyAllowance(address(kc)), 0);

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(StakePot.DailyLimitExceeded.selector, address(kc), 1 ether, 0)
        );
        pot.withdrawTo(W2, alice, address(kc), 1 ether);
    }

    function test_dailyLimit_tracksUsageWhileUnlimited() public {
        _depositKc(alice, alice, DEPOSIT);

        vm.prank(operator);
        pot.withdrawTo(W1, alice, address(kc), 4 ether);

        vm.prank(owner);
        pot.setDailyWithdrawLimit(address(kc), 5 ether);
        assertEq(pot.remainingDailyAllowance(address(kc)), 1 ether);
    }

    function test_withdrawTo_reentrancyBlocked() public {
        ReentrantOperator attacker = new ReentrantOperator(pot);

        vm.prank(alice);
        pot.stakeNative{ value: 5 ether }(alice);
        vm.prank(owner);
        pot.setOperator(address(attacker));

        attacker.attack(W1, W2, 1 ether);

        assertTrue(attacker.attempted(), "reentry was never attempted");
        assertFalse(attacker.succeeded(), "reentrancy guard did not hold");
        assertFalse(pot.processedWithdrawals(W2));
        assertEq(address(pot).balance, 4 ether);
    }

    function test_withdrawTo_revertsWhenNativeRecipientRejects() public {
        RejectingReceiver rejecter = new RejectingReceiver();
        vm.prank(alice);
        pot.stakeNative{ value: 5 ether }(alice);

        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(
                StakePot.NativeTransferFailed.selector, address(rejecter), 1 ether
            )
        );
        pot.withdrawTo(W1, address(rejecter), native, 1 ether);

        assertEq(address(pot).balance, 5 ether);
        assertFalse(pot.processedWithdrawals(W1));
    }

    function test_ownerWithdrawTo_paysOut() public {
        _depositKc(alice, alice, DEPOSIT);

        vm.expectEmit(true, true, true, true, address(pot));
        emit StakePot.Withdrawn(W1, treasury, address(kc), 3 ether);

        vm.prank(owner);
        pot.ownerWithdrawTo(W1, treasury, address(kc), 3 ether);

        assertEq(kc.balanceOf(treasury), 3 ether);
        assertEq(pot.holdings(address(kc)), DEPOSIT - 3 ether);
    }

    function test_ownerWithdrawTo_onlyOwner() public {
        _depositKc(alice, alice, DEPOSIT);

        vm.prank(operator);
        vm.expectRevert();
        pot.ownerWithdrawTo(W1, treasury, address(kc), 1 ether);

        vm.prank(alice);
        vm.expectRevert();
        pot.ownerWithdrawTo(W1, treasury, address(kc), 1 ether);
    }

    function test_ownerWithdrawTo_worksWhilePaused() public {
        _depositKc(alice, alice, DEPOSIT);
        vm.prank(owner);
        pot.setPaused(true);

        vm.prank(operator);
        vm.expectRevert(StakePot.IsPaused.selector);
        pot.withdrawTo(W1, alice, address(kc), 1 ether);

        vm.prank(owner);
        pot.ownerWithdrawTo(W2, treasury, address(kc), DEPOSIT);
        assertEq(pot.holdings(address(kc)), 0);
    }

    function test_ownerWithdrawTo_ignoresDailyLimit() public {
        _depositKc(alice, alice, DEPOSIT);
        vm.prank(owner);
        pot.setDailyWithdrawLimit(address(kc), 1 ether);

        vm.prank(owner);
        pot.ownerWithdrawTo(W1, treasury, address(kc), DEPOSIT);

        assertEq(kc.balanceOf(treasury), DEPOSIT);
        assertEq(pot.remainingDailyAllowance(address(kc)), 1 ether);
    }

    function test_ownerWithdrawTo_sharesIdSpaceWithOperator() public {
        _depositKc(alice, alice, DEPOSIT);

        vm.prank(operator);
        pot.withdrawTo(W1, alice, address(kc), 1 ether);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(StakePot.AlreadyProcessed.selector, W1));
        pot.ownerWithdrawTo(W1, treasury, address(kc), 1 ether);

        vm.prank(owner);
        pot.ownerWithdrawTo(W2, treasury, address(kc), 1 ether);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(StakePot.AlreadyProcessed.selector, W2));
        pot.withdrawTo(W2, alice, address(kc), 1 ether);
    }

    function test_ownerWithdrawTo_native() public {
        vm.prank(alice);
        pot.stakeNative{ value: 5 ether }(alice);

        vm.prank(owner);
        pot.ownerWithdrawTo(W1, treasury, native, 5 ether);

        assertEq(treasury.balance, 5 ether);
        assertEq(address(pot).balance, 0);
    }

    function test_ownerWithdrawTo_revertsBeyondHoldings() public {
        _depositKc(alice, alice, DEPOSIT);

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                StakePot.InsufficientHoldings.selector, address(kc), DEPOSIT + 1, DEPOSIT
            )
        );
        pot.ownerWithdrawTo(W1, treasury, address(kc), DEPOSIT + 1);
    }

    function test_admin_onlyOwner() public {
        vm.startPrank(alice);
        vm.expectRevert();
        pot.setOperator(alice);
        vm.expectRevert();
        pot.setPaused(true);
        vm.expectRevert();
        pot.setTokenAllowed(address(kc), false);
        vm.expectRevert();
        pot.setDailyWithdrawLimit(address(kc), 1);
        vm.stopPrank();
    }

    function test_setOperator_movesWithdrawRights() public {
        _depositKc(alice, alice, DEPOSIT);

        vm.prank(owner);
        pot.setOperator(bob);

        vm.prank(operator);
        vm.expectRevert(StakePot.NotOperator.selector);
        pot.withdrawTo(W1, alice, address(kc), 1 ether);

        vm.prank(bob);
        pot.withdrawTo(W1, alice, address(kc), 1 ether);
    }

    function test_setOperator_rejectsZero() public {
        vm.prank(owner);
        vm.expectRevert(StakePot.ZeroAddress.selector);
        pot.setOperator(address(0));
    }

    function test_constructor_rejectsZeroOperator() public {
        vm.expectRevert(StakePot.ZeroAddress.selector);
        new StakePot(owner, address(0));
    }

    function test_setPaused_unpauseRestoresFlow() public {
        vm.prank(owner);
        pot.setPaused(true);
        vm.prank(owner);
        pot.setPaused(false);

        _depositKc(alice, alice, DEPOSIT);
        assertEq(pot.holdings(address(kc)), DEPOSIT);
    }

    function testFuzz_holdingsTrackDepositsMinusWithdrawals(
        uint96 depositA,
        uint96 depositB,
        uint96 payout
    ) public {
        depositA = uint96(bound(depositA, 1, 50 ether));
        depositB = uint96(bound(depositB, 1, 50 ether));
        _depositKc(alice, alice, depositA);
        _depositKc(bob, bob, depositB);

        uint256 pooled = uint256(depositA) + uint256(depositB);
        assertEq(pot.holdings(address(kc)), pooled);

        payout = uint96(bound(payout, 1, type(uint96).max));
        vm.prank(operator);
        if (payout > pooled) {
            vm.expectRevert(
                abi.encodeWithSelector(
                    StakePot.InsufficientHoldings.selector, address(kc), payout, pooled
                )
            );
            pot.withdrawTo(W1, alice, address(kc), payout);
            assertEq(pot.holdings(address(kc)), pooled);
        } else {
            pot.withdrawTo(W1, alice, address(kc), payout);
            assertEq(pot.holdings(address(kc)), pooled - payout);
        }
    }

    function testFuzz_withdrawalIdNeverPaysTwice(bytes32 id, uint96 first, uint96 second) public {
        _depositKc(alice, alice, 50 ether);
        first = uint96(bound(first, 1, 25 ether));
        second = uint96(bound(second, 1, 25 ether));

        vm.prank(operator);
        pot.withdrawTo(id, alice, address(kc), first);
        uint256 afterFirst = pot.holdings(address(kc));

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(StakePot.AlreadyProcessed.selector, id));
        pot.withdrawTo(id, alice, address(kc), second);

        assertEq(pot.holdings(address(kc)), afterFirst);
    }
}
