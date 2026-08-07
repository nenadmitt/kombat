import type { AuthSession, UserProfile } from '@gaming-platform/core';
import { create } from 'zustand';

import { apiClient, onSessionChange } from '../lib/api';
import { sessionStorage } from '../lib/session-storage';
import { useWebsocketStore } from './websocket.store';

type SessionState = {
  /** Null until the stored session has been checked against the server. */
  user: UserProfile | null;
  hasSession: boolean;
  loading: boolean;
  signIn: (session: AuthSession) => Promise<void>;
  signOut: () => Promise<void>;
  restore: () => Promise<void>;
  setUser: (user: UserProfile) => void;
};

export const useSessionStore = create<SessionState>((set, get) => ({
  user: null,
  hasSession: Boolean(sessionStorage.read()),
  loading: true,

  restore: async () => {
    if (!sessionStorage.read()) {
      set({ loading: false, hasSession: false, user: null });
      return;
    }
    try {
      const user = await apiClient.getCurrentUser();
      set({ user, hasSession: true, loading: false });
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
    set({ user: null, hasSession: false, loading: false });
    if (refreshToken) await apiClient.logout(refreshToken);
  },

  setUser: user => set({ user }),
}));

onSessionChange(session => {
  if (session) {
    // The socket was authenticated with a token the server has now expired.
    useWebsocketStore.getState().reconnect();
    return;
  }
  useWebsocketStore.getState().disconnect();
  useSessionStore.setState({ user: null, hasSession: false, loading: false });
});
