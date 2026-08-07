// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console } from "forge-std/Script.sol";
import { StakePot } from "../src/StakePot.sol";

/**
 * @notice Deploys the pooled StakePot and wires its allowlist + withdrawal
 *         rate limits. Roles mirror the escrow deployment:
 *         - owner    → the platform cold key (pause, allowlist, limits)
 *         - operator → the broadcasting hot key (withdrawals; the server
 *           signs with it as OPERATOR_PRIVATE_KEY)
 *
 *         Deployed with the broadcaster as initial owner so the allowlist and
 *         limits can be configured in the same run, then ownership moves to
 *         the cold key.
 *
 *         The daily limits are the blast radius of a compromised operator
 *         key - set them to a generous multiple of expected daily withdrawal
 *         volume, not to infinity. Record the deployment block: the server's
 *         deposit watcher needs it as STAKE_POT_DEPLOY_BLOCK.
 *
 *         Deploy + verify:
 *           source .env && forge script script/DeployStakePot.s.sol \
 *             --rpc-url sepolia --broadcast --private-key $PRIVATE_KEY
 */
contract DeployStakePot is Script {
    /// @dev Platform cold key: final owner (pause + admin).
    address internal constant PLATFORM_OWNER = 0x0aB34352B087a107302aFF5d155e23a11637Caa1;

    /// @dev Existing Sepolia KombatCoin (fixed 100M supply).
    address internal constant DEFAULT_KOMBAT = 0xFE25C2b2400144c6536b9F707F06b751D6eeF943;

    /// @dev Existing Sepolia MockUSDC - reused so fauceted balances stay valid.
    address internal constant DEFAULT_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    /// @dev Rolling 24h withdrawal caps per asset (testnet-generous).
    uint256 internal constant NATIVE_DAILY_LIMIT = 10 ether;
    uint256 internal constant KOMBAT_DAILY_LIMIT = 500_000 ether;
    uint256 internal constant USDC_DAILY_LIMIT = 100_000e6;

    function run() external returns (StakePot pot) {
        address kombat = vm.envOr("KOMBAT_ADDRESS", DEFAULT_KOMBAT);
        address usdc = vm.envOr("USDC_ADDRESS", DEFAULT_USDC);

        vm.startBroadcast();
        address operator = msg.sender;

        // Broadcaster starts as owner so the allowlist can be set here.
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
