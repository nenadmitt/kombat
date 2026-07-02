import * as Keychain from 'react-native-keychain';

import { WALLET_KEYCHAIN_SERVICE } from '../storage/storage-keys';

type StoredWalletSecret = {
  mnemonic: string;
  privateKey: string;
};

/** Securely persists the mnemonic + derived private key (iOS Keychain / Android Keystore). */
export async function saveWalletSecret(
  secret: StoredWalletSecret,
): Promise<void> {
  await Keychain.setGenericPassword('wallet', JSON.stringify(secret), {
    service: WALLET_KEYCHAIN_SERVICE,
  });
}

export async function getWalletSecret(): Promise<StoredWalletSecret | null> {
  const result = await Keychain.getGenericPassword({
    service: WALLET_KEYCHAIN_SERVICE,
  });
  if (!result) {
    return null;
  }
  return JSON.parse(result.password) as StoredWalletSecret;
}

export async function clearWalletSecret(): Promise<void> {
  await Keychain.resetGenericPassword({ service: WALLET_KEYCHAIN_SERVICE });
}
