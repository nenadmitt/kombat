import { ApiClient, type AuthSession } from '@gaming-platform/core';

import { env } from './env';
import { sessionStorage } from './session-storage';

type SessionListener = (session: AuthSession | null) => void;

const listeners = new Set<SessionListener>();

/** Notified when the client rotates or drops the session behind everyone's back. */
export function onSessionChange(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(session: AuthSession | null): void {
  listeners.forEach(listener => listener(session));
}

export const apiClient = new ApiClient({
  baseUrl: env.apiBaseUrl,
  appPlatform: 'web',
  getAccessToken: () =>
    Promise.resolve(sessionStorage.read()?.accessToken ?? null),
  getRefreshToken: () =>
    Promise.resolve(sessionStorage.read()?.refreshToken ?? null),
  onSessionRefreshed: session => {
    sessionStorage.write(session);
    announce(session);
    return Promise.resolve();
  },
  onSessionExpired: () => {
    sessionStorage.clear();
    announce(null);
    return Promise.resolve();
  },
});
