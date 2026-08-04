import {
  CHAIN_TOKENS,
  StakeAsset,
  stakeAssetAddresses,
} from '@gaming-platform/core';
import type { Address } from 'viem';

/**
 * ERC20 addresses per stake asset (Native/ETH has none, it's address(0) on
 * the pot). Keyed by chain id. Derived from the shared registry in core.
 */
export type TokenAddresses = Partial<Record<StakeAsset, Address>>;

export const TOKEN_REGISTRY = new Map<number, TokenAddresses>(
  Object.keys(CHAIN_TOKENS).map(chainId => [
    Number(chainId),
    stakeAssetAddresses(Number(chainId)) as TokenAddresses,
  ]),
);
