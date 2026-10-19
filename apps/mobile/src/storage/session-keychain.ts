import * as Keychain from 'react-native-keychain';
import type { AuthSession } from '@gaming-platform/core';

import { SESSION_KEYCHAIN_SERVICE } from './storage-keys';

/** `undefined` means not read from the Keychain yet; `null` means read, and there is none. */
let cached: AuthSession | null | undefined;

let loading: Promise<AuthSession | null> | null = null;

export async function getSession(): Promise<AuthSession | null> {
  if (cached !== undefined) {
    return cached;
  }
  loading ??= readFromKeychain().finally(() => {
    loading = null;
  });
  return loading;
}

async function readFromKeychain(): Promise<AuthSession | null> {
  let session: AuthSession | null = null;
  try {
    const result = await Keychain.getGenericPassword({
      service: SESSION_KEYCHAIN_SERVICE,
    });
    session = result ? (JSON.parse(result.password) as AuthSession) : null;
  } catch {
    session = null;
  }
  cached = session;
  return session;
}

// Memory first: the server revokes the old refresh token on rotation, so a failed write must not leave memory stale.
// A failed write is logged, not thrown: the session is still valid.
export async function saveSession(session: AuthSession): Promise<void> {
  cached = session;
  try {
    await Keychain.setGenericPassword('session', JSON.stringify(session), {
      service: SESSION_KEYCHAIN_SERVICE,
      // Kept out of backups, but readable after first unlock so a background refresh works after a reboot.
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  } catch (error) {
    console.warn(
      '[session] could not persist to the Keychain; this session survives ' +
        'in memory but the app will need a fresh login after a restart',
      error,
    );
  }
}

export async function clearSession(): Promise<void> {
  cached = null;
  await Keychain.resetGenericPassword({ service: SESSION_KEYCHAIN_SERVICE });
}
