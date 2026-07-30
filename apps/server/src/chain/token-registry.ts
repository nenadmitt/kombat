import { StakeAsset } from '@gaming-platform/core';
import type { Address } from 'viem';

/**
 * ERC20 addresses per stake asset (Native/ETH has none — it's address(0) on
 * the escrow). Keyed by chain id.
 */
export type TokenAddresses = Partial<Record<StakeAsset, Address>>;

/**
 * Canonical token addresses per chain — hardcoded on purpose: these are
 * facts about a chain, not deployment configuration, and every entry must
 * match the pot's on-chain allowlist (apps/evm-contracts/README.md).
 * Adding a chain = adding an entry here (plus CHAIN_ID/STAKE_POT_ADDRESS env).
 */
export const TOKEN_REGISTRY = new Map<number, TokenAddresses>([
  [
    11155111, // Sepolia
    {
      // Not the KC the retired MatchEscrow deployment points at.
      [StakeAsset.Kombat]: '0x01a659Df789D3E433D7cdFf4CAc70596C56B03c0',
      [StakeAsset.Usdc]: '0x277c9f3957633C99ef8F7421B980B50C41b31a7b',
    },
  ],
]);
