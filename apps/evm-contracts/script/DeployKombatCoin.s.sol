// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console } from "forge-std/Script.sol";
import { KombatCoin } from "../src/KombatCoin.sol";

/**
 * @notice Deploys a fresh KombatCoin and splits the fixed 100M supply.
 *
 *         KC has no mint function, so the whole supply has to be positioned at
 *         deployment. The broadcaster receives it (constructor mints to a single
 *         address), then hands out:
 *         - FAUCET_FLOAT to FAUCET_ADDRESS, the hot wallet the server's signup
 *           grant pays from;
 *         - everything else to PLATFORM_OWNER, the treasury cold key.
 *
 *         The broadcaster keeps nothing.
 *
 *         Deploy:
 *           source .env && FAUCET_ADDRESS=0x... forge script \
 *             script/DeployKombatCoin.s.sol --rpc-url sepolia \
 *             --private-key $PRIVATE_KEY --broadcast
 */
contract DeployKombatCoin is Script {
    /// @dev Platform cold key: holds the undistributed supply.
    address internal constant PLATFORM_OWNER = 0x0aB34352B087a107302aFF5d155e23a11637Caa1;

    /// @dev Seeded to the faucet wallet, sized for 1,000 KC per new player.
    uint256 internal constant FAUCET_FLOAT = 1_000_000 ether;

    function run() external returns (KombatCoin kc) {
        address faucet = vm.envAddress("FAUCET_ADDRESS");
        require(faucet != address(0), "FAUCET_ADDRESS required");

        vm.startBroadcast();
        address deployer = msg.sender;

        kc = new KombatCoin(deployer);
        kc.transfer(faucet, FAUCET_FLOAT);
        kc.transfer(PLATFORM_OWNER, kc.balanceOf(deployer));

        vm.stopBroadcast();

        console.log("KombatCoin deployed at:", address(kc));
        console.log("  deployed in block:   ", block.number);
        console.log("  faucet:              ", faucet);
        console.log("  faucet float (wei):  ", FAUCET_FLOAT);
        console.log("  treasury:            ", PLATFORM_OWNER);
        console.log("  treasury balance:    ", kc.balanceOf(PLATFORM_OWNER));
        console.log("Update TOKEN_REGISTRY (server) and CHAIN_TOKENS (mobile).");
    }
}
