import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  ApiError,
  ErrorCode,
  WalletNetwork,
  type WalletSummary,
} from '@gaming-platform/core';

import { apiClient } from '../api/client';
import {
  ACCESS_TOKEN_STORAGE_KEY,
  BOOT_SNAPSHOT_STORAGE_KEY,
} from '../storage/storage-keys';
import {
  deriveAddressFromPrivateKey,
  derivePrivateKeyFromMnemonic,
} from '../wallet/derive-wallet';
import { getWalletSecret, saveWalletSecret } from '../wallet/wallet-keychain';
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
  wallet: WalletSummary | null;
}): void {
  persistSnapshot({
    userId: state.userId,
    email: state.email,
    username: state.username,
    wallet: state.wallet,
  });
}

/** Wallet for an offline boot: last-good snapshot, else the address derived
 *  from the Keychain secret (the key never leaves the device). */
async function resolveOfflineWallet(): Promise<WalletSummary | null> {
  const snapshot = await readSnapshot();
  if (snapshot?.wallet) {
    return snapshot.wallet;
  }
  try {
    const secret = await getWalletSecret();
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
 * Everything about the current user: auth (JWT persisted in AsyncStorage),
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
  profileError: LoadError | null;

  walletStatus: WalletStatus;
  wallet: WalletSummary | null;
  walletError: LoadError | null;

  /** Reads the persisted JWT on app start. */
  load: () => Promise<void>;
  /** Persists the JWT after a successful login and marks the user authenticated. */
  loginWithToken: (accessToken: string) => Promise<void>;
  /** Clears the persisted JWT and profile state (wallet is left intact - see below). */
  logout: () => Promise<void>;
  /** Fetches the user's email/username. */
  loadProfile: () => Promise<void>;
  /** Sets the username (onboarding) - 409s (via ApiError) if already taken. */
  updateUsername: (username: string) => Promise<void>;
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
  profileError: null,

  walletStatus: 'idle',
  wallet: null,
  walletError: null,

  load: async () => {
    // TODO: this only checks whether a token is present, not whether it's
    // expired - a stale JWT is currently only caught the first time an API
    // call 401s, not here. Revisit once refresh tokens are implemented.
    const accessToken = await AsyncStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    set({
      accessToken,
      authStatus: accessToken ? 'authenticated' : 'unauthenticated',
    });
  },

  loginWithToken: async accessToken => {
    await AsyncStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);
    set({ accessToken, authStatus: 'authenticated' });
  },

  logout: async () => {
    await AsyncStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    // The snapshot belongs to this login - a different account must not
    // boot offline into someone else's profile.
    await AsyncStorage.removeItem(BOOT_SNAPSHOT_STORAGE_KEY);
    // Wallet state (and its Keychain-backed secret) is intentionally left
    // alone - the wallet persists across logout so logging back in as the
    // same user doesn't need to re-fetch/re-create it.
    set({
      accessToken: null,
      authStatus: 'unauthenticated',
      userId: null,
      email: null,
      username: null,
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
      const { id, email, username } = await apiClient.getCurrentUser();
      set({ userId: id, email, username, profileStatus: 'ready' });
      const { wallet } = get();
      persistSnapshot({ userId: id, email, username, wallet });
    } catch (err) {
      // Server unreachable but we have a last-good snapshot: boot into
      // offline mode instead of the error screen. Games are gated by the
      // server store; the wallet is fully local anyway.
      if (err instanceof ApiError && err.isNetworkError) {
        const snapshot = await readSnapshot();
        if (snapshot?.userId) {
          set({
            userId: snapshot.userId,
            email: snapshot.email,
            username: snapshot.username,
            profileStatus: 'ready',
          });
          useServerStore.getState().reportOffline();
          return;
        }
        useServerStore.getState().reportOffline();
      }
      set({
        profileStatus: 'error',
        profileError: toLoadError(err, 'Failed to load profile'),
      });
    }
  },

  updateUsername: async username => {
    // Let ApiError (e.g. 409 taken) propagate - the caller (OnboardingScreen) shows it inline.
    const updated = await apiClient.updateUsername(username);
    set({ username: updated.username });
  },

  ensureWallet: async () => {
    const { walletStatus } = get();
    if (walletStatus === 'checking' || walletStatus === 'creating') {
      return;
    }
    set({ walletStatus: 'checking', walletError: null });
    try {
      const wallets = await apiClient.listWallets();
      if (wallets.length > 0) {
        set({ wallet: wallets[0], walletStatus: 'ready' });
        persistCurrentSnapshot(get());
        return;
      }

      set({ walletStatus: 'creating' });
      const { address, mnemonic } = await apiClient.createWallet(
        WalletNetwork.Ethereum,
      );
      const privateKey = derivePrivateKeyFromMnemonic(mnemonic);
      await saveWalletSecret({ mnemonic, privateKey });
      set({
        wallet: { address, network: WalletNetwork.Ethereum },
        walletStatus: 'ready',
      });
      persistCurrentSnapshot(get());
    } catch (err) {
      // Offline fallback: snapshot first, else recover the address straight
      // from the Keychain secret - creating a brand-new wallet is the only
      // path that truly needs the server.
      if (err instanceof ApiError && err.isNetworkError) {
        const offlineWallet = await resolveOfflineWallet();
        if (offlineWallet) {
          set({ wallet: offlineWallet, walletStatus: 'ready' });
          useServerStore.getState().reportOffline();
          return;
        }
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
