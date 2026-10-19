import { getAddress, isAddress, type Address } from 'viem';
import { normalize } from 'viem/ens';

import { getMainnetClient, VIEM_CHAIN } from './rpc';
import type { BalanceChainId } from './tokens';

function evmCoinType(chainId: BalanceChainId): bigint {
  return 0x80000000n + BigInt(VIEM_CHAIN[chainId].id);
}

/** Labels stay permissive: normalize() is what validates them, and ENS names can carry unicode. */
const ENS_NAME_PATTERN = /^[^.\s]+(?:\.[^.\s]+)*\.[a-z]{2,3}$/i;

export type ResolvedRecipient = {
  address: Address;
  ensName?: string;
};

export async function resolveRecipient(
  input: string,
  chainId: BalanceChainId,
): Promise<ResolvedRecipient> {
  const value = input.trim();

  if (isAddress(value)) {
    return { address: getAddress(value) };
  }

  if (!ENS_NAME_PATTERN.test(value)) {
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
