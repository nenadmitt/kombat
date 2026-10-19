// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Script, console } from "forge-std/Script.sol";
import { KombatCoin } from "../src/KombatCoin.sol";

/// @notice KC has no mint, so the whole supply is split here: FAUCET_FLOAT to the faucet hot wallet, the rest to the cold key.
contract DeployKombatCoin is Script {
    address internal constant PLATFORM_OWNER = 0x0aB34352B087a107302aFF5d155e23a11637Caa1;

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
