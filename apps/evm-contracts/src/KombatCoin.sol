// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice Fixed supply: no mint function exists beyond the constructor.
contract KombatCoin is ERC20, ERC20Permit {
    uint256 public constant INITIAL_SUPPLY = 100_000_000 ether;

    constructor(address treasury) ERC20("KombatCoin", "KC") ERC20Permit("KombatCoin") {
        _mint(treasury, INITIAL_SUPPLY);
    }
}
