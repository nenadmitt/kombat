/**
 * Where the JWT used to live, in plaintext. Only read now, to migrate an
 * existing session into the Keychain once; see `session-keychain.ts`.
 */
export const LEGACY_ACCESS_TOKEN_STORAGE_KEY = 'auth.accessToken';

/** react-native-keychain service name for the access + refresh token pair. */
export const SESSION_KEYCHAIN_SERVICE = 'gaming-platform.session';

/** react-native-keychain service name for the wallet mnemonic + private key. */
export const WALLET_KEYCHAIN_SERVICE = 'gaming-platform.wallet';

/** AsyncStorage key for the last-good profile + wallet snapshot (offline boot). */
export const BOOT_SNAPSHOT_STORAGE_KEY = 'boot.snapshot';
