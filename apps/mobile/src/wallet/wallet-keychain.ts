import * as Keychain from 'react-native-keychain';

import { WALLET_KEYCHAIN_SERVICE } from '../storage/storage-keys';

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

export async function getWalletSecret(
  userId: string,
): Promise<StoredWalletSecret | null> {
  return read(serviceFor(userId));
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
