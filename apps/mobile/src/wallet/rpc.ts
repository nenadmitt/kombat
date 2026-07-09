import { createPublicClient, http } from 'viem';
import { base, mainnet, sepolia } from 'viem/chains';

import { env } from '../config/env';
import type { BalanceChainId } from './tokens';

const ALCHEMY_SUBDOMAIN: Record<BalanceChainId, string> = {
  base: 'base-mainnet',
  sepolia: 'eth-sepolia',
};

export const VIEM_CHAIN = { base, sepolia };

export function alchemyRpcUrl(chainId: BalanceChainId): string {
  return `https://${ALCHEMY_SUBDOMAIN[chainId]}.g.alchemy.com/v2/${env.alchemyToken}`;
}

export function getPublicClient(chainId: BalanceChainId) {
  return createPublicClient({
    chain: VIEM_CHAIN[chainId],
    transport: http(alchemyRpcUrl(chainId)),
  });
}

/** ENS lives on L1; resolution always runs against a mainnet client. */
export function getMainnetClient() {
  return createPublicClient({
    chain: mainnet,
    transport: http(
      `https://eth-mainnet.g.alchemy.com/v2/${env.alchemyToken}`,
    ),
  });
}
