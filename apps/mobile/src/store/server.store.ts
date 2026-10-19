import { create } from 'zustand';
import {
  ApiError,
  isVersionBelow,
  type PlatformStatus,
} from '@gaming-platform/core';

import { apiClient } from '../api/client';
import { APP_VERSION } from '../config/app-version';
import { useCurrentUserStore } from './currentUser.store';

export type ServerStatus = 'online' | 'offline' | 'maintenance';

const RECOVERY_POLL_MS = 20_000;

export type UpdateInfo = {
  latestVersion: string | null;
  message: string | null;
  notes: string[];
  sizeLabel: string | null;
  urls: { ios?: string | null; android?: string | null };
};

type ServerState = {
  status: ServerStatus;
  message: string | null;
  updateRequired: boolean;
  update: UpdateInfo | null;

  reportOffline: () => void;
  applyPlatformStatus: (platform: PlatformStatus) => void;
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
  updateRequired: false,
  update: null,

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
    const updateRequired = isVersionBelow(APP_VERSION, platform.minAppVersion);
    set({
      status: platform.maintenance ? 'maintenance' : 'online',
      message: platform.message,
      updateRequired,
      update: updateRequired
        ? {
            latestVersion:
              platform.latestAppVersion ?? platform.minAppVersion ?? null,
            message: platform.updateMessage ?? null,
            notes: platform.updateNotes ?? [],
            sizeLabel: platform.updateSizeLabel ?? null,
            urls: platform.updateUrls ?? {},
          }
        : null,
    });
    if (wasOffline) {
      // The socket reconnects on its own (socket.io retries forever).
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
      // A non-network error still proves the server answered; leave the state alone.
    }
  },
}));
