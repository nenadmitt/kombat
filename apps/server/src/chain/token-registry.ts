import {
  CHAIN_TOKENS,
  StakeAsset,
  stakeAssetAddresses,
} from '@gaming-platform/core';
import type { Address } from 'viem';

export type TokenAddresses = Partial<Record<StakeAsset, Address>>;

export const TOKEN_REGISTRY = new Map<number, TokenAddresses>(
  Object.keys(CHAIN_TOKENS).map(chainId => [
    Number(chainId),
    stakeAssetAddresses(Number(chainId)) as TokenAddresses,
  ]),
);
