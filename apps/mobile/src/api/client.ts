import { ApiClient } from '@gaming-platform/core';

import { APP_VERSION } from '../config/app-version';
import { env } from '../config/env';
import {
  clearSession,
  getSession,
  saveSession,
} from '../storage/session-keychain';

// The callbacks reach the stores via lazy require: the stores import this module, so a top-level import would cycle.
export const apiClient = new ApiClient({
  baseUrl: env.apiBaseUrl,
  appVersion: APP_VERSION,
  getAccessToken: async () => (await getSession())?.accessToken ?? null,
  getRefreshToken: async () => (await getSession())?.refreshToken ?? null,

  // Re-open the socket: the server drops it once the old token lapses, and it cannot recover on its own.
  onSessionRefreshed: async session => {
    await saveSession(session);
    currentUserStore().setState({ accessToken: session.accessToken });
    websocketStore().getState().reconnect();
  },

  // The Keychain is cleared first so an in-flight request can't resurrect the session.
  onSessionExpired: async () => {
    await clearSession();
    currentUserStore().setState({
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
  },
});

function currentUserStore() {
  return (
    require('../store/currentUser.store') as typeof import('../store/currentUser.store')
  ).useCurrentUserStore;
}

function websocketStore() {
  return (
    require('../store/websocket.store') as typeof import('../store/websocket.store')
  ).useWebsocketStore;
}
