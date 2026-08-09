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

/** The address is a property of the key, not something the server tells us. */
function walletFromKey(privateKey: string): WalletSummary {
  return {
    address: deriveAddressFromPrivateKey(privateKey),
    network: WalletNetwork.Ethereum,
    custodial: false,
  };
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
    // Same for the cached lifetime record - it is this account's.
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
      // Non-custodial: the key on this device is the wallet, and its address
      // is derived from it. The server is a directory that maps an address
      // back to a player, never an authority on what this wallet is - so once
      // the key is here, everything below works with the server unreachable.
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
        // No key here, so the only route to one is a slot from before secrets
        // were keyed by user. Adopting proves ownership against the server's
        // address first, which is what the server's row is for.
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
      // Storing a key that does not control the registered address would strand
      // the wallet on creation, and the mnemonic is returned exactly once.
      if (!derivesTo(privateKey, address)) {
        throw new Error('Wallet key does not match the address issued for it');
      }
      await saveWalletSecret(userId, { mnemonic, privateKey });
      set({ wallet: walletFromKey(privateKey), walletStatus: 'ready' });
      persistCurrentSnapshot(get());
    } catch (err) {
      // Reached only with no key on this device, so there is nothing to fall
      // back to: minting the first one is the one thing that needs the server.
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
