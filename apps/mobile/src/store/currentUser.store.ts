import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  ApiError,
  ErrorCode,
  WalletNetwork,
  type AuthSession,
  type WalletSummary,
} from '@gaming-platform/core';

import { apiClient } from '../api/client';
import { BOOT_SNAPSHOT_STORAGE_KEY } from '../storage/storage-keys';
import {
  clearSession,
  getSession,
  saveSession,
} from '../storage/session-keychain';
import {
  deriveAddressFromPrivateKey,
  derivePrivateKeyFromMnemonic,
} from '../wallet/derive-wallet';
import {
  clearLegacyWalletSecret,
  getWalletSecret,
  readLegacyWalletSecret,
  saveWalletSecret,
} from '../wallet/wallet-keychain';
import { useGameStore } from './game.store';
import { useServerStore } from './server.store';

type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';
type WalletStatus = 'idle' | 'checking' | 'creating' | 'ready' | 'error';
type ProfileStatus = 'idle' | 'loading' | 'ready' | 'error';

export type LoadError = {
  message: string;
  code: string;
};

function toLoadError(err: unknown, fallbackMessage: string): LoadError {
  if (err instanceof ApiError) {
    return { message: err.message, code: err.code };
  }
  return {
    message: err instanceof Error ? err.message : fallbackMessage,
    code: ErrorCode.Unknown,
  };
}

/** Last-good profile + wallet, persisted after every successful load so the
 *  app can boot into offline mode when the server is unreachable. */
type BootSnapshot = {
  userId: string | null;
  email: string | null;
  username: string | null;
  ensName: string | null;
  referralCode: string | null;
  wallet: WalletSummary | null;
};

async function readSnapshot(): Promise<BootSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(BOOT_SNAPSHOT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BootSnapshot) : null;
  } catch {
    return null;
  }
}

function persistSnapshot(state: BootSnapshot): void {
  AsyncStorage.setItem(
    BOOT_SNAPSHOT_STORAGE_KEY,
    JSON.stringify(state),
  ).catch(() => {
    // Best-effort - a failed write only costs the next offline boot.
  });
}

function persistCurrentSnapshot(state: {
  userId: string | null;
  email: string | null;
  username: string | null;
  ensName: string | null;
  referralCode: string | null;
  wallet: WalletSummary | null;
}): void {
  persistSnapshot({
    userId: state.userId,
    email: state.email,
    username: state.username,
    ensName: state.ensName,
    referralCode: state.referralCode,
    wallet: state.wallet,
  });
}

/** Wallet for an offline boot: last-good snapshot, else the address derived
 *  from the Keychain secret (the key never leaves the device). */
/**
 * Move a pre-per-user secret into this account's slot, once its address proves
 * it belongs to them. Wrong-owner secrets are left where they are rather than
 * deleted: on a shared device that slot is still somebody's only key.
 */
async function adoptLegacySecret(
  userId: string,
  address: string,
): Promise<void> {
  try {
    if (await getWalletSecret(userId)) {
      return;
    }
    const legacy = await readLegacyWalletSecret();
    if (!legacy) {
      return;
    }
    const derived = deriveAddressFromPrivateKey(legacy.privateKey);
    if (derived.toLowerCase() !== address.toLowerCase()) {
      return;
    }
    await saveWalletSecret(userId, legacy);
    await clearLegacyWalletSecret();
  } catch {
    // A failed migration only costs the next attempt: the legacy slot is
    // untouched unless the keyed copy was written first.
  }
}

async function resolveOfflineWallet(
  userId: string | null,
): Promise<WalletSummary | null> {
  const snapshot = await readSnapshot();
  if (snapshot?.wallet) {
    return snapshot.wallet;
  }
  if (!userId) {
    return null;
  }
  try {
    const secret = await getWalletSecret(userId);
    if (!secret) {
      return null;
    }
    return {
      address: deriveAddressFromPrivateKey(secret.privateKey),
      network: WalletNetwork.Ethereum,
    };
  } catch {
    return null;
  }
}

/**
 * Everything about the current user: auth (session persisted in the Keychain),
 * profile (email/username), and wallet (mnemonic/private key persisted in
 * Keychain). Kept as one store since they're tightly coupled - logging out
 * clears auth + profile, but not the wallet (see `logout` below).
 */
type CurrentUserState = {
  authStatus: AuthStatus;
  accessToken: string | null;

  profileStatus: ProfileStatus;
  /** The user's own id - lets screens tell "mine" from "theirs" (e.g. room
   *  creator vs joiner) without decoding the JWT. */
  userId: string | null;
  email: string | null;
  username: string | null;
  /** <label>.playkombat.xyz once minted; null until then. */
  ensName: string | null;
  /** This user's own shareable referral code (null until onboarding). */
  referralCode: string | null;
  profileError: LoadError | null;

  walletStatus: WalletStatus;
  wallet: WalletSummary | null;
  walletError: LoadError | null;

  /** Reads the persisted session on app start (migrating a legacy one). */
  load: () => Promise<void>;
  /** Persists the session after a successful login and marks the user authenticated. */
  loginWithSession: (session: AuthSession) => Promise<void>;
  /** Stores a rotated pair after ApiClient refreshed it mid-flight. */
  applyRefreshedSession: (session: AuthSession) => Promise<void>;
  /** Revokes and clears the session and profile state (wallet is left intact). */
  logout: () => Promise<void>;
  /** Fetches the user's email/username. */
  loadProfile: () => Promise<void>;
  /** Sets the username (onboarding) - 409s (via ApiError) if already taken. */
  updateUsername: (username: string, referredByCode?: string) => Promise<void>;
  /** Lists the user's wallets; creates one (Ethereum) if they have none yet. */
  ensureWallet: () => Promise<void>;
  /** Refreshes cache-hydrated profile/wallet once the server is back. */
  resyncAfterOffline: () => Promise<void>;
};

export const useCurrentUserStore = create<CurrentUserState>((set, get) => ({
  authStatus: 'loading',
  accessToken: null,

  profileStatus: 'idle',
  userId: null,
  email: null,
  username: null,
  ensName: null,
  referralCode: null,
  profileError: null,

  walletStatus: 'idle',
  wallet: null,
  walletError: null,

  load: async () => {
    // Presence is all that is checked here: an access token now lives days
    // rather than a month, so the first 401 refreshes it transparently
    // (ApiClient drives that) and only a dead refresh token logs the user out.
    const session = await getSession();
    set({
      accessToken: session?.accessToken ?? null,
      authStatus: session ? 'authenticated' : 'unauthenticated',
    });
  },

  loginWithSession: async session => {
    await saveSession(session);
    set({ accessToken: session.accessToken, authStatus: 'authenticated' });
  },

  /** Store a rotated pair and keep the socket's copy of the token current. */
  applyRefreshedSession: async session => {
    await saveSession(session);
    set({ accessToken: session.accessToken });
  },

  logout: async () => {
    // Revoke server-side first, so a stolen refresh token dies with the
    // session rather than outliving it for a month.
    const session = await getSession();
    if (session?.refreshToken) {
      // Best effort: a server that cannot revoke must not strand the user in
      // a session they asked to leave.
      await apiClient.logout(session.refreshToken).catch(() => undefined);
    }
    await clearSession();
    // The snapshot belongs to this login - a different account must not
    // boot offline into someone else's profile.
    await AsyncStorage.removeItem(BOOT_SNAPSHOT_STORAGE_KEY);
    // The secret stays in the Keychain, keyed by user, so signing back in as
    // the same account still finds it. The in-memory wallet does not: leaving
    // walletStatus 'ready' meant the navigator never re-ran ensureWallet, and
    // the next account inherited this one's address and key.
    set({
      wallet: null,
      walletStatus: 'idle',
      walletError: null,
      accessToken: null,
      authStatus: 'unauthenticated',
      userId: null,
      email: null,
      username: null,
      ensName: null,
      referralCode: null,
      profileStatus: 'idle',
      profileError: null,
    });
    // A "waiting for players" popup shouldn't survive into a different
    // logged-in session.
    useGameStore.getState().clear();
  },

  loadProfile: async () => {
    if (get().profileStatus === 'loading') {
      return;
    }
    set({ profileStatus: 'loading', profileError: null });
    try {
      const { id, email, username, ensName, referralCode } =
        await apiClient.getCurrentUser();
      set({
        userId: id,
        email,
        username,
        ensName,
        referralCode,
        profileStatus: 'ready',
      });
      const { wallet } = get();
      persistSnapshot({
        userId: id,
        email,
        username,
        ensName,
        referralCode,
        wallet,
      });
    } catch (err) {
      // Any failure, not just an unreachable server: with a last-good
      // snapshot the app has everything it needs to run degraded, and the
      // wallet is local anyway. Games stay gated by the server store.
      const snapshot = await readSnapshot();
      if (snapshot?.userId) {
        set({
          userId: snapshot.userId,
          email: snapshot.email,
          username: snapshot.username,
          ensName: snapshot.ensName ?? null,
          referralCode: snapshot.referralCode ?? null,
          profileStatus: 'ready',
        });
        useServerStore.getState().reportOffline();
        return;
      }

      const unreachable = err instanceof ApiError && err.isNetworkError;
      if (unreachable) {
        // Offline with nothing cached: retrying is the only thing that can
        // help, so keep the session and let the error screen offer it.
        useServerStore.getState().reportOffline();
        set({
          profileStatus: 'error',
          profileError: toLoadError(err, 'Failed to load profile'),
        });
        return;
      }

      // The server answered and it cannot give us this profile, with no cache
      // to fall back on. Retrying will keep failing; signing in again is the
      // only way through. The wallet secret outlives logout.
      await get().logout();
    }
  },

  updateUsername: async (username, referredByCode) => {
    // Let ApiError (e.g. 409 taken, 400 bad referral code) propagate - the
    // caller (OnboardingScreen) shows it inline.
    const updated = await apiClient.updateUsername(username, referredByCode);
    set({
      username: updated.username,
      ensName: updated.ensName,
      referralCode: updated.referralCode,
    });
  },

  ensureWallet: async () => {
    const { walletStatus, userId } = get();
    if (walletStatus === 'checking' || walletStatus === 'creating') {
      return;
    }
    if (!userId) {
      return; // The profile decides whose wallet this is.
    }
    set({ walletStatus: 'checking', walletError: null });
    try {
      const wallets = await apiClient.listWallets();
      if (wallets.length > 0) {
        await adoptLegacySecret(userId, wallets[0].address);
        set({ wallet: wallets[0], walletStatus: 'ready' });
        persistCurrentSnapshot(get());
        return;
      }

      set({ walletStatus: 'creating' });
      const { address, mnemonic } = await apiClient.createWallet(
        WalletNetwork.Ethereum,
      );
      const privateKey = derivePrivateKeyFromMnemonic(mnemonic);
      await saveWalletSecret(userId, { mnemonic, privateKey });
      set({
        wallet: { address, network: WalletNetwork.Ethereum },
        walletStatus: 'ready',
      });
      persistCurrentSnapshot(get());
    } catch (err) {
      // Offline fallback: snapshot first, else recover the address straight
      // from the Keychain secret - creating a brand-new wallet is the only
      // path that truly needs the server.
      const offlineWallet = await resolveOfflineWallet(get().userId);
      if (offlineWallet) {
        set({ wallet: offlineWallet, walletStatus: 'ready' });
        useServerStore.getState().reportOffline();
        return;
      }
      if (err instanceof ApiError && err.isNetworkError) {
        useServerStore.getState().reportOffline();
      }
      set({
        walletStatus: 'error',
        walletError: toLoadError(err, 'Failed to set up wallet'),
      });
    }
  },

  resyncAfterOffline: async () => {
    // Re-run both loads; their success paths overwrite the cache-hydrated
    // values and re-persist the snapshot.
    await Promise.all([get().loadProfile(), get().ensureWallet()]);
  },
}));
