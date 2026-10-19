import * as Keychain from 'react-native-keychain';

import { WALLET_KEYCHAIN_SERVICE } from '../storage/storage-keys';
import { deriveAddressFromPrivateKey } from './derive-wallet';

type StoredWalletSecret = {
  mnemonic: string;
  privateKey: string;
};

/** One slot per account: a shared slot would let the next account sign with the previous one's key. */
const serviceFor = (userId: string) => `${WALLET_KEYCHAIN_SERVICE}.${userId}`;

export async function saveWalletSecret(
  userId: string,
  secret: StoredWalletSecret,
): Promise<void> {
  await Keychain.setGenericPassword('wallet', JSON.stringify(secret), {
    service: serviceFor(userId),
  });
}

/** A plain read: adopting the legacy slot goes through adoptLegacySecret, which proves ownership first. */
export async function getWalletSecret(
  userId: string,
): Promise<StoredWalletSecret | null> {
  return read(serviceFor(userId));
}

/** Wrong owner: leave the legacy secret in place, because the account it belongs to has no other copy. */
export async function adoptLegacySecret(
  userId: string,
  expectedAddress: string,
): Promise<StoredWalletSecret | null> {
  if (await read(serviceFor(userId))) {
    return null;
  }
  const legacy = await read(WALLET_KEYCHAIN_SERVICE);
  if (!legacy) {
    return null;
  }
  if (!derivesTo(legacy.privateKey, expectedAddress)) {
    return null;
  }
  await saveWalletSecret(userId, legacy);
  await clearLegacyWalletSecret();
  return legacy;
}

export function derivesTo(privateKey: string, address: string): boolean {
  try {
    return (
      deriveAddressFromPrivateKey(privateKey).toLowerCase() ===
      address.toLowerCase()
    );
  } catch {
    return false;
  }
}

export async function clearWalletSecret(userId: string): Promise<void> {
  await Keychain.resetGenericPassword({ service: serviceFor(userId) });
}

export async function readLegacyWalletSecret(): Promise<StoredWalletSecret | null> {
  return read(WALLET_KEYCHAIN_SERVICE);
}

export async function clearLegacyWalletSecret(): Promise<void> {
  await Keychain.resetGenericPassword({ service: WALLET_KEYCHAIN_SERVICE });
}

async function read(service: string): Promise<StoredWalletSecret | null> {
  const result = await Keychain.getGenericPassword({ service });
  if (!result) {
    return null;
  }
  try {
    return JSON.parse(result.password) as StoredWalletSecret;
  } catch {
    return null;
  }
}
