import * as Keychain from 'react-native-keychain';
import type { AuthSession } from '@gaming-platform/core';

import { SESSION_KEYCHAIN_SERVICE } from './storage-keys';

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
 *
 * This module owns the session. Everything else reads it through here, so the
 * cache below is the single copy and cannot drift.
 */

/**
 * The live session. `undefined` means "not read from the Keychain yet";
 * `null` means "read, and there is none".
 *
 * A Keychain read is IPC to the platform keystore, so doing one per
 * authenticated request would put a serialized native round-trip in front of
 * every single call. The credential only ever changes through this module, so
 * one read per launch is all that is needed.
 */
let cached: AuthSession | null | undefined;

/** Coalesces the concurrent first reads a cold start fires off. */
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
    // Unreadable or corrupt entry - treat as logged out rather than crashing
    // the boot. A fresh login overwrites it.
    session = null;
  }
  cached = session;
  return session;
}

/**
 * Persist a session, updating the in-memory copy first.
 *
 * That order matters on rotation. The server revokes the old refresh token the
 * instant it issues a new pair, so if the Keychain write failed and we had kept
 * the old value in memory, the next refresh would present a revoked token - the
 * server's reuse detection would read that as theft and revoke every session
 * the user has. Holding the new pair in memory keeps this launch working, and
 * the next successful write persists it.
 *
 * A failed write is therefore logged, not thrown: the session is valid and
 * usable, and failing the caller's request would be the worse outcome.
 */
export async function saveSession(session: AuthSession): Promise<void> {
  cached = session;
  try {
    await Keychain.setGenericPassword('session', JSON.stringify(session), {
      service: SESSION_KEYCHAIN_SERVICE,
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
  // Memory first, so nothing can read a session that is being torn down.
  cached = null;
  await Keychain.resetGenericPassword({ service: SESSION_KEYCHAIN_SERVICE });
}
