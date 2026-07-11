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
 * match the escrow's on-chain allowlist (apps/evm-contracts/README.md).
 * Adding a chain = adding an entry here (plus CHAIN_ID/ESCROW_ADDRESS env).
 */
export const TOKEN_REGISTRY = new Map<number, TokenAddresses>([
  [
    11155111, // Sepolia
    {
      [StakeAsset.Kombat]: '0xFE25C2b2400144c6536b9F707F06b751D6eeF943',
      [StakeAsset.Usdc]: '0x277c9f3957633C99ef8F7421B980B50C41b31a7b',
    },
  ],
]);
