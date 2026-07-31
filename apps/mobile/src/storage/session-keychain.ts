import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import type { AuthSession } from '@gaming-platform/core';

import {
  LEGACY_ACCESS_TOKEN_STORAGE_KEY,
  SESSION_KEYCHAIN_SERVICE,
} from './storage-keys';

/**
 * The auth session lives in the Keychain / Android Keystore, never
 * AsyncStorage.
 *
 * Both halves are credentials: the access token authenticates every request and
 * the socket, and the refresh token can mint new ones for a month. AsyncStorage
 * is plain on-disk data - readable from an unencrypted backup or an extracted
 * device - so it is the wrong home for either.
 *
 * `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` is the weakest setting that still
 * satisfies that: `THIS_DEVICE_ONLY` keeps the item out of backups and off any
 * restored device, and `AFTER_FIRST_UNLOCK` (rather than `WHEN_UNLOCKED`) lets
 * the app refresh in the background after a reboot without the user opening it.
 */
export async function saveSession(session: AuthSession): Promise<void> {
  await Keychain.setGenericPassword('session', JSON.stringify(session), {
    service: SESSION_KEYCHAIN_SERVICE,
    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function getSession(): Promise<AuthSession | null> {
  const result = await Keychain.getGenericPassword({
    service: SESSION_KEYCHAIN_SERVICE,
  });
  if (!result) {
    return null;
  }
  try {
    return JSON.parse(result.password) as AuthSession;
  } catch {
    // Unreadable entry - treat as logged out rather than crashing the boot.
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SESSION_KEYCHAIN_SERVICE });
  await AsyncStorage.removeItem(LEGACY_ACCESS_TOKEN_STORAGE_KEY);
}

/**
 * Move a pre-refresh-token session out of AsyncStorage on first launch after
 * upgrading, so existing players aren't logged out by the change.
 *
 * The migrated session has no refresh token - one was never issued - so it
 * keeps working until its access token expires and then requires a normal
 * login. That is the intended end state: it retires every long-lived token that
 * was sitting in plaintext.
 */
export async function migrateLegacySession(): Promise<AuthSession | null> {
  const legacy = await AsyncStorage.getItem(LEGACY_ACCESS_TOKEN_STORAGE_KEY);
  if (!legacy) {
    return null;
  }
  const session: AuthSession = { accessToken: legacy, refreshToken: '' };
  await saveSession(session);
  await AsyncStorage.removeItem(LEGACY_ACCESS_TOKEN_STORAGE_KEY);
  return session;
}
