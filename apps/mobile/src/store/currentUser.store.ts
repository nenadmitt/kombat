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
  adoptLegacySecret,
  derivesTo,
  getWalletSecret,
  saveWalletSecret,
} from '../wallet/wallet-keychain';
import { useGameStore } from './game.store';
import { usePlayerStatsStore } from './playerStats.store';
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

function walletFromKey(privateKey: string): WalletSummary {
  return {
    address: deriveAddressFromPrivateKey(privateKey),
    network: WalletNetwork.Ethereum,
    custodial: false,
  };
}

type CurrentUserState = {
  authStatus: AuthStatus;
  accessToken: string | null;

  profileStatus: ProfileStatus;
  userId: string | null;
  email: string | null;
  username: string | null;
  ensName: string | null;
  referralCode: string | null;
  profileError: LoadError | null;

  walletStatus: WalletStatus;
  wallet: WalletSummary | null;
  walletError: LoadError | null;

  load: () => Promise<void>;
  loginWithSession: (session: AuthSession) => Promise<void>;
  applyRefreshedSession: (session: AuthSession) => Promise<void>;
  logout: () => Promise<void>;
  loadProfile: () => Promise<void>;
  updateUsername: (username: string, referredByCode?: string) => Promise<void>;
  ensureWallet: () => Promise<void>;
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
    // Presence only: the first 401 refreshes the token transparently, and only a dead refresh token logs out.
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

  applyRefreshedSession: async session => {
    await saveSession(session);
    set({ accessToken: session.accessToken });
  },

  logout: async () => {
    // Revoke server-side first so a stolen refresh token dies with the session.
    const session = await getSession();
    if (session?.refreshToken) {
      // Best effort: a server that cannot revoke must not strand the user in a session they asked to leave.
      await apiClient.logout(session.refreshToken).catch(() => undefined);
    }
    await clearSession();
    // A different account must not boot offline into this profile.
    await AsyncStorage.removeItem(BOOT_SNAPSHOT_STORAGE_KEY);
    // The secret stays in the per-user Keychain slot, but the in-memory wallet must go or the next account inherits it.
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
    useGameStore.getState().clear();
    usePlayerStatsStore.getState().clear();
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
        useServerStore.getState().reportOffline();
        set({
          profileStatus: 'error',
          profileError: toLoadError(err, 'Failed to load profile'),
        });
        return;
      }

      await get().logout();
    }
  },

  updateUsername: async (username, referredByCode) => {
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
      return;
    }
    set({ walletStatus: 'checking', walletError: null });
    try {
      // Non-custodial: the device key is the wallet; the server only maps an address back to a player.
      const existing = await getWalletSecret(userId);
      if (existing) {
        set({
          wallet: walletFromKey(existing.privateKey),
          walletStatus: 'ready',
        });
        persistCurrentSnapshot(get());
        return;
      }

      const wallets = await apiClient.listWallets();
      if (wallets.length > 0) {
        // No key here: the only route to one is a legacy pre-per-user slot, adopted only after proving it against the server's address.
        for (const candidate of wallets) {
          const adopted = await adoptLegacySecret(userId, candidate.address);
          if (adopted) {
            set({
              wallet: walletFromKey(adopted.privateKey),
              walletStatus: 'ready',
            });
            persistCurrentSnapshot(get());
            return;
          }
        }
        set({
          wallet: wallets[0],
          walletStatus: 'error',
          walletError: {
            message:
              'Your wallet was created on another device and its key never left it. Sign in there to move funds.',
            code: ErrorCode.Unknown,
          },
        });
        return;
      }

      set({ walletStatus: 'creating' });
      const { address, mnemonic } = await apiClient.createWallet(
        WalletNetwork.Ethereum,
      );
      const privateKey = derivePrivateKeyFromMnemonic(mnemonic);
      // Storing a key that doesn't control the registered address would strand the wallet; the mnemonic is returned exactly once.
      if (!derivesTo(privateKey, address)) {
        throw new Error('Wallet key does not match the address issued for it');
      }
      await saveWalletSecret(userId, { mnemonic, privateKey });
      set({ wallet: walletFromKey(privateKey), walletStatus: 'ready' });
      persistCurrentSnapshot(get());
    } catch (err) {
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
    await Promise.all([get().loadProfile(), get().ensureWallet()]);
  },
}));
