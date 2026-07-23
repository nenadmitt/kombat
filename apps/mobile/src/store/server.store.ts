import { create } from 'zustand';
import { ApiError, type PlatformStatus } from '@gaming-platform/core';

import { apiClient } from '../api/client';
import { useCurrentUserStore } from './currentUser.store';

export type ServerStatus = 'online' | 'offline' | 'maintenance';

/** How often to re-probe /status while the server is unreachable. */
const RECOVERY_POLL_MS = 20_000;

/**
 * Single source of truth for "can we talk to the game server, and is
 * multiplayer open". Fed by bootstrap/API network failures (reportOffline),
 * the /status probe (refresh) and the maintenance socket broadcast
 * (applyPlatformStatus). While offline it polls /status until the server
 * answers again, then triggers a profile/wallet re-sync.
 */
type ServerState = {
  status: ServerStatus;
  /** Operator-provided maintenance copy for the banner, when any. */
  message: string | null;

  /** Any API call that never reached the server calls this. */
  reportOffline: () => void;
  /** A /status payload arrived (probe or socket push) - the server is up. */
  applyPlatformStatus: (platform: PlatformStatus) => void;
  /** One /status probe; flips state either way. Safe to call repeatedly. */
  refresh: () => Promise<void>;
};

let recoveryTimer: ReturnType<typeof setInterval> | null = null;

const stopRecoveryPolling = () => {
  if (recoveryTimer) {
    clearInterval(recoveryTimer);
    recoveryTimer = null;
  }
};

export const useServerStore = create<ServerState>((set, get) => ({
  status: 'online',
  message: null,

  reportOffline: () => {
    if (get().status === 'offline') {
      return;
    }
    set({ status: 'offline', message: null });
    if (!recoveryTimer) {
      recoveryTimer = setInterval(() => {
        void get().refresh();
      }, RECOVERY_POLL_MS);
    }
  },

  applyPlatformStatus: platform => {
    stopRecoveryPolling();
    const wasOffline = get().status === 'offline';
    set({
      status: platform.maintenance ? 'maintenance' : 'online',
      message: platform.message,
    });
    if (wasOffline) {
      // The server came back: refresh whatever we booted from cache. The
      // socket reconnects on its own (socket.io retries forever).
      void useCurrentUserStore.getState().resyncAfterOffline();
    }
  },

  refresh: async () => {
    try {
      const platform = await apiClient.getPlatformStatus();
      get().applyPlatformStatus(platform);
    } catch (err) {
      if (err instanceof ApiError && err.isNetworkError) {
        get().reportOffline();
      }
      // A non-network error still proves the server answered; leave the
      // current state alone rather than guessing.
    }
  },
}));
