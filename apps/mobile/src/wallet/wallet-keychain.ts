import * as Keychain from 'react-native-keychain';

import { WALLET_KEYCHAIN_SERVICE } from '../storage/storage-keys';
import { deriveAddressFromPrivateKey } from './derive-wallet';

type StoredWalletSecret = {
  mnemonic: string;
  privateKey: string;
};

/**
 * One slot per account. A device may hold several logins over its life and the
 * server keeps only the address, so a shared slot would let the next account
 * sign with the previous one's key - and overwrite the only copy of it.
 */
const serviceFor = (userId: string) => `${WALLET_KEYCHAIN_SERVICE}.${userId}`;

/** Securely persists the mnemonic + derived private key (iOS Keychain / Android Keystore). */
export async function saveWalletSecret(
  userId: string,
  secret: StoredWalletSecret,
): Promise<void> {
  await Keychain.setGenericPassword('wallet', JSON.stringify(secret), {
    service: serviceFor(userId),
  });
}

/**
 * This account's secret, falling back to the pre-per-user slot for installs
 * that predate the split. A fallback is migrated on the spot, so the old slot
 * empties the first time its owner signs in.
 *
 * `expectedAddress` is what keeps a shared device honest: without it any
 * account would adopt whatever key the device happens to hold.
 */
export async function getWalletSecret(
  userId: string,
  expectedAddress?: string,
): Promise<StoredWalletSecret | null> {
  const keyed = await read(serviceFor(userId));
  if (keyed) {
    return keyed;
  }
  const legacy = await read(WALLET_KEYCHAIN_SERVICE);
  if (!legacy) {
    return null;
  }
  if (
    expectedAddress &&
    deriveAddressFromPrivateKey(legacy.privateKey).toLowerCase() !==
      expectedAddress.toLowerCase()
  ) {
    return null;
  }
  await saveWalletSecret(userId, legacy);
  await clearLegacyWalletSecret();
  return legacy;
}

export async function clearWalletSecret(userId: string): Promise<void> {
  await Keychain.resetGenericPassword({ service: serviceFor(userId) });
}

/**
 * The slot from before secrets were keyed by user. Installs predating that
 * hold their only copy of the key here, so sign-in adopts it - but only for
 * the account whose address it actually derives to.
 */
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
