import { getAddress, isAddress, type Address } from 'viem';
import { normalize } from 'viem/ens';

import { getMainnetClient, VIEM_CHAIN } from './rpc';
import type { BalanceChainId } from './tokens';

/** ENSIP-11 coin type for an EVM chain (0x80000000 | chainId). */
function evmCoinType(chainId: BalanceChainId): bigint {
  return 0x80000000n + BigInt(VIEM_CHAIN[chainId].id);
}

export type ResolvedRecipient = {
  address: Address;
  /** Set when the input was an ENS name that we resolved. */
  ensName?: string;
};

/**
 * Turns a user-entered recipient (raw address or ENS name) into a checksummed
 * address. ENS names resolve on L1 using the selected chain's coin type, falling
 * back to the default ETH address.
 */
export async function resolveRecipient(
  input: string,
  chainId: BalanceChainId,
): Promise<ResolvedRecipient> {
  const value = input.trim();

  if (isAddress(value)) {
    return { address: getAddress(value) };
  }

  // Any name with a dot: .eth, a DNS name imported into ENS, an offchain
  // subname resolved through CCIP-read. Which of those resolve is the
  // resolver's business, not a hardcoded suffix list.
  if (!value.includes('.') || value.startsWith('.') || value.endsWith('.')) {
    throw new Error('Enter a valid address or ENS name');
  }

  const client = getMainnetClient();
  const name = normalize(value);

  const address =
    (await client
      .getEnsAddress({ name, coinType: evmCoinType(chainId) })
      .catch(() => null)) ??
    (await client.getEnsAddress({ name }).catch(() => null));

  if (!address) {
    throw new Error(`Couldn't resolve ${value}`);
  }

  return { address, ensName: value };
}
