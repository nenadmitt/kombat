import type { AuthSession, UserProfile, WalletSummary } from '@gaming-platform/core';
import { create } from 'zustand';

import { apiClient, onSessionChange } from '../lib/api';
import { sessionStorage } from '../lib/session-storage';
import { useWebsocketStore } from './websocket.store';

type SessionState = {
  user: UserProfile | null;
  hasSession: boolean;
  loading: boolean;
  /** Null while unknown; never gate on null. */
  hasWallet: boolean | null;
  walletIsCustodial: boolean;
  walletPromptDismissed: boolean;
  setHasWallet: (hasWallet: boolean, custodial?: boolean) => void;
  dismissWalletPrompt: () => void;
  signIn: (session: AuthSession) => Promise<void>;
  signOut: () => Promise<void>;
  restore: () => Promise<void>;
  setUser: (user: UserProfile) => void;
};

export const useSessionStore = create<SessionState>((set, get) => ({
  user: null,
  hasSession: Boolean(sessionStorage.read()),
  loading: true,
  hasWallet: null,
  walletIsCustodial: false,
  walletPromptDismissed: false,

  restore: async () => {
    if (!sessionStorage.read()) {
      set({ loading: false, hasSession: false, user: null });
      return;
    }
    try {
      const user = await apiClient.getCurrentUser();
      // Fail open: a wallet-list hiccup must not wall anyone out of the app.
      const wallets = await apiClient.listWallets().catch(() => null);
      set({
        user,
        hasWallet: wallets === null ? null : wallets.length > 0,
        walletIsCustodial: (wallets ?? []).some(wallet => wallet.custodial),
        hasSession: true,
        loading: false,
      });
      useWebsocketStore.getState().connect();
    } catch {
      // A rejected refresh already cleared storage via onSessionExpired.
      set({ user: null, hasSession: Boolean(sessionStorage.read()), loading: false });
    }
  },

  signIn: async session => {
    sessionStorage.write(session);
    set({ hasSession: true, loading: true });
    await get().restore();
  },

  signOut: async () => {
    const refreshToken = sessionStorage.read()?.refreshToken;
    useWebsocketStore.getState().disconnect();
    sessionStorage.clear();
    set({
      user: null,
      hasSession: false,
      loading: false,
      hasWallet: null,
      walletIsCustodial: false,
      walletPromptDismissed: false,
    });
    if (refreshToken) await apiClient.logout(refreshToken);
  },

  setUser: user => set({ user }),

  setHasWallet: (hasWallet, custodial = false) =>
    set({ hasWallet, walletIsCustodial: custodial }),
  dismissWalletPrompt: () => set({ walletPromptDismissed: true }),
}));

onSessionChange(session => {
  if (session) {
    useWebsocketStore.getState().reconnect();
    return;
  }
  useWebsocketStore.getState().disconnect();
  useSessionStore.setState({ user: null, hasSession: false, loading: false });
});
