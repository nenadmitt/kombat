// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console } from "forge-std/Script.sol";
import { KombatCoin } from "../src/KombatCoin.sol";
import { MatchEscrow } from "../src/MatchEscrow.sol";

/**
 * @notice Deploys the platform contracts:
 *         - KombatCoin, with its fixed 100M supply minted to the platform key
 *         - MatchEscrow, with a 5% platform fee and the platform key as both
 *           owner and operator (the operator can be repointed to the game
 *           contract later via `setOperator`)
 *
 *         Dry run:
 *           forge script script/DeployMatchEscrow.s.sol --rpc-url sepolia
 *         Deploy + verify:
 *           source .env && forge script script/DeployMatchEscrow.s.sol \
 *             --rpc-url sepolia --broadcast --verify --private-key $PRIVATE_KEY
 */
contract DeployMatchEscrow is Script {
    /// @dev Platform key: KC treasury, escrow owner (admin + fee withdrawal)
    ///      and escrow operator (creates/settles stakes).
    address internal constant PLATFORM = 0x0aB34352B087a107302aFF5d155e23a11637Caa1;

    /// @dev 5% platform fee (MatchEscrow hard-caps at 10%).
    uint16 internal constant FEE_BPS = 500;

    function run() external returns (KombatCoin kc, MatchEscrow escrow) {
        vm.startBroadcast();
        kc = new KombatCoin(PLATFORM);
        escrow = new MatchEscrow(PLATFORM, PLATFORM, FEE_BPS);
        vm.stopBroadcast();

        console.log("KombatCoin deployed at: ", address(kc));
        console.log("MatchEscrow deployed at:", address(escrow));
        console.log("  owner/operator:", PLATFORM);
        console.log("  feeBps:        ", FEE_BPS);
    }
}
