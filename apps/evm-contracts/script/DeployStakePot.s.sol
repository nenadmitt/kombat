// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console } from "forge-std/Script.sol";
import { StakePot } from "../src/StakePot.sol";

contract DeployStakePot is Script {
    address internal constant PLATFORM_OWNER = 0x0aB34352B087a107302aFF5d155e23a11637Caa1;

    address internal constant DEFAULT_KOMBAT = 0x01a659Df789D3E433D7cdFf4CAc70596C56B03c0;

    /// @dev Reused so fauceted balances stay valid.
    address internal constant DEFAULT_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    /// @dev Caps bound the blast radius of a compromised operator key.
    uint256 internal constant NATIVE_DAILY_LIMIT = 10 ether;
    uint256 internal constant KOMBAT_DAILY_LIMIT = 500_000 ether;
    uint256 internal constant USDC_DAILY_LIMIT = 100_000e6;

    function run() external returns (StakePot pot) {
        address kombat = vm.envOr("KOMBAT_ADDRESS", DEFAULT_KOMBAT);
        address usdc = vm.envOr("USDC_ADDRESS", DEFAULT_USDC);

        vm.startBroadcast();
        address operator = msg.sender;

        // Broadcaster owns it first so the allowlist and limits can be set before handing off.
        pot = new StakePot(operator, operator);
        address native = pot.NATIVE();

        pot.setTokenAllowed(native, true);
        pot.setTokenAllowed(kombat, true);
        pot.setTokenAllowed(usdc, true);

        pot.setDailyWithdrawLimit(native, NATIVE_DAILY_LIMIT);
        pot.setDailyWithdrawLimit(kombat, KOMBAT_DAILY_LIMIT);
        pot.setDailyWithdrawLimit(usdc, USDC_DAILY_LIMIT);

        pot.transferOwnership(PLATFORM_OWNER);
        vm.stopBroadcast();

        console.log("StakePot deployed at:", address(pot));
        console.log("  deployed in block: ", block.number);
        console.log("  owner:             ", PLATFORM_OWNER);
        console.log("  operator:          ", operator);
        console.log("  allowlisted: NATIVE, KOMBAT, USDC");
        console.log("  kombat:            ", kombat);
        console.log("  usdc:              ", usdc);
        console.log("Set STAKE_POT_ADDRESS and STAKE_POT_DEPLOY_BLOCK on the server.");
    }
}
