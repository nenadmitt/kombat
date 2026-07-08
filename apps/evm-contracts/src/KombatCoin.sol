// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title KombatCoin (KC)
 * @notice The platform's play currency. Standard 18-decimal ERC20 with
 *         EIP-2612 permit and a fixed supply: 100,000,000 KC minted to the
 *         platform treasury at deployment, with no way to mint more.
 *
 *         Distribution is earn-only as a matter of platform policy: the
 *         treasury hands tokens out as rewards. The token itself stays freely
 *         transferable — the escrow needs that, and restricting transfers
 *         on-chain would buy nothing.
 */
contract KombatCoin is ERC20, ERC20Permit {
    /// @notice Total (and only) supply: 100 million KC.
    uint256 public constant INITIAL_SUPPLY = 100_000_000 ether;

    constructor(address treasury) ERC20("KombatCoin", "KC") ERC20Permit("KombatCoin") {
        _mint(treasury, INITIAL_SUPPLY);
    }
}
