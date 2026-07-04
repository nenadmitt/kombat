import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  ApiError,
  ErrorCode,
  WalletNetwork,
  type WalletSummary,
} from '@gaming-platform/core';

import { apiClient } from '../api/client';
import { ACCESS_TOKEN_STORAGE_KEY } from '../storage/storage-keys';
import { derivePrivateKeyFromMnemonic } from '../wallet/derive-wallet';
import { saveWalletSecret } from '../wallet/wallet-keychain';
import { useGameStore } from './game.store';

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

/**
 * Everything about the current user: auth (JWT persisted in AsyncStorage),
 * profile (email/username), and wallet (mnemonic/private key persisted in
 * Keychain). Kept as one store since they're tightly coupled — logging out
 * clears auth + profile, but not the wallet (see `logout` below).
 */
type CurrentUserState = {
  authStatus: AuthStatus;
  accessToken: string | null;

  profileStatus: ProfileStatus;
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
  /** Clears the persisted JWT and profile state (wallet is left intact — see below). */
  logout: () => Promise<void>;
  /** Fetches the user's email/username. */
  loadProfile: () => Promise<void>;
  /** Sets the username (onboarding) — 409s (via ApiError) if already taken. */
  updateUsername: (username: string) => Promise<void>;
  /** Lists the user's wallets; creates one (Ethereum) if they have none yet. */
  ensureWallet: () => Promise<void>;
};

export const useCurrentUserStore = create<CurrentUserState>((set, get) => ({
  authStatus: 'loading',
  accessToken: null,

  profileStatus: 'idle',
  email: null,
  username: null,
  profileError: null,

  walletStatus: 'idle',
  wallet: null,
  walletError: null,

  load: async () => {
    // TODO: this only checks whether a token is present, not whether it's
    // expired — a stale JWT is currently only caught the first time an API
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
    // Wallet state (and its Keychain-backed secret) is intentionally left
    // alone — the wallet persists across logout so logging back in as the
    // same user doesn't need to re-fetch/re-create it.
    set({
      accessToken: null,
      authStatus: 'unauthenticated',
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
      const { email, username } = await apiClient.getCurrentUser();
      set({ email, username, profileStatus: 'ready' });
    } catch (err) {
      set({
        profileStatus: 'error',
        profileError: toLoadError(err, 'Failed to load profile'),
      });
    }
  },

  updateUsername: async username => {
    // Let ApiError (e.g. 409 taken) propagate — the caller (OnboardingScreen) shows it inline.
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
    } catch (err) {
      set({
        walletStatus: 'error',
        walletError: toLoadError(err, 'Failed to set up wallet'),
      });
    }
  },
}));
