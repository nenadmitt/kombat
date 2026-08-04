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
 * This account's secret. A plain read - adopting the legacy slot is
 * `adoptLegacySecret`, which proves ownership first. Migrating from here would
 * mean every caller silently claims whatever key the device holds, and the
 * claim destroys the only copy.
 */
export async function getWalletSecret(
  userId: string,
): Promise<StoredWalletSecret | null> {
  return read(serviceFor(userId));
}

/**
 * Moves a pre-per-user secret into this account's slot, but only when it
 * derives to `expectedAddress`. Wrong owner: leave it where it is, because the
 * account it belongs to has no other copy.
 */
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

/** Whether a stored key actually controls `address`. */
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
