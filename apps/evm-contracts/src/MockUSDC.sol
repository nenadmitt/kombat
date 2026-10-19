// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice Testnet only: anyone can mint via `faucet`.
contract MockUSDC is ERC20, ERC20Permit {
    uint256 public constant FAUCET_MAX = 10_000e6;

    error FaucetAmountTooLarge(uint256 requested, uint256 max);

    constructor() ERC20("Mock USD Coin", "USDC") ERC20Permit("Mock USD Coin") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet(uint256 amount) external {
        if (amount > FAUCET_MAX) revert FaucetAmountTooLarge(amount, FAUCET_MAX);
        _mint(msg.sender, amount);
    }
}
