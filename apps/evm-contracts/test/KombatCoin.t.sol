// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { KombatCoin } from "../src/KombatCoin.sol";

contract KombatCoinTest is Test {
    KombatCoin internal kc;
    address internal owner = makeAddr("owner");

    function setUp() public {
        kc = new KombatCoin(owner);
    }

    function test_Metadata() public view {
        assertEq(kc.name(), "KombatCoin");
        assertEq(kc.symbol(), "KC");
        assertEq(kc.decimals(), 18);
    }

    function test_FixedSupplyMintedToTreasury() public view {
        assertEq(kc.totalSupply(), 100_000_000 ether);
        assertEq(kc.balanceOf(owner), 100_000_000 ether);
        assertEq(kc.INITIAL_SUPPLY(), 100_000_000 ether);
    }

    function test_PermitSetsAllowance() public {
        (address alice, uint256 alicePk) = makeAddrAndKey("alice");
        address spender = makeAddr("spender");
        uint256 deadline = block.timestamp + 1 hours;

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                ),
                alice,
                spender,
                42 ether,
                kc.nonces(alice),
                deadline
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", kc.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePk, digest);

        kc.permit(alice, spender, 42 ether, deadline, v, r, s);
        assertEq(kc.allowance(alice, spender), 42 ether);
        assertEq(kc.nonces(alice), 1);
    }
}
