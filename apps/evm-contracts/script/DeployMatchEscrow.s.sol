// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console } from "forge-std/Script.sol";
import { MatchEscrow } from "../src/MatchEscrow.sol";
import { MockUSDC } from "../src/MockUSDC.sol";

/**
 * @notice Deploys the v2 escrow + the MockUSDC test token, wires the
 *         allowlist, and splits roles:
 *         - owner    → the platform cold key (admin, fee withdrawal)
 *         - operator → the broadcasting hot key (creates/funds/settles;
 *           the server signs with it as OPERATOR_PRIVATE_KEY)
 *
 *         The escrow is deployed with the broadcaster as initial owner so the
 *         allowlist can be configured in the same run, then ownership is
 *         transferred to the cold key.
 *
 *         KombatCoin is NOT redeployed — the existing Sepolia deployment is
 *         allowlisted (override with KOMBAT_ADDRESS if needed).
 *
 *         Deploy + verify:
 *           source .env && forge script script/DeployMatchEscrow.s.sol \
 *             --rpc-url sepolia --broadcast --private-key $PRIVATE_KEY
 */
contract DeployMatchEscrow is Script {
    /// @dev Platform cold key: final owner (admin + fee withdrawal).
    address internal constant PLATFORM_OWNER = 0x0aB34352B087a107302aFF5d155e23a11637Caa1;

    /// @dev Existing Sepolia KombatCoin (fixed 100M supply).
    address internal constant DEFAULT_KOMBAT = 0xFE25C2b2400144c6536b9F707F06b751D6eeF943;

    /// @dev 5% platform fee (owner-updatable on-chain, hard cap 10%).
    uint16 internal constant FEE_BPS = 500;

    function run() external returns (MatchEscrow escrow, MockUSDC usdc) {
        address kombat = vm.envOr("KOMBAT_ADDRESS", DEFAULT_KOMBAT);

        vm.startBroadcast();
        address operator = msg.sender;

        usdc = new MockUSDC();
        // Broadcaster starts as owner so the allowlist can be set here.
        escrow = new MatchEscrow(operator, operator, FEE_BPS);
        escrow.setTokenAllowed(escrow.NATIVE(), true);
        escrow.setTokenAllowed(kombat, true);
        escrow.setTokenAllowed(address(usdc), true);
        escrow.transferOwnership(PLATFORM_OWNER);

        vm.stopBroadcast();

        console.log("MatchEscrow v2 deployed at:", address(escrow));
        console.log("MockUSDC deployed at:      ", address(usdc));
        console.log("  owner:   ", PLATFORM_OWNER);
        console.log("  operator:", operator);
        console.log("  feeBps:  ", FEE_BPS);
        console.log("  allowlisted: NATIVE, KOMBAT, USDC");
        console.log("  kombat:  ", kombat);
    }
}
