import { ApiClient } from '@gaming-platform/core';

import { env } from '../config/env';
import {
  clearSession,
  getSession,
  saveSession,
} from '../storage/session-keychain';

/**
 * Shared API client singleton. Reads the session straight from the Keychain
 * rather than importing the auth store, so this module has no dependency on
 * store state - that would be a store <-> api-client import cycle.
 *
 * The same cycle is why the callbacks below reach the store through a lazy
 * `require`: the store imports this module at load time, so it can only be
 * resolved later, when a callback actually fires.
 */
export const apiClient = new ApiClient({
  baseUrl: env.apiBaseUrl,
  getAccessToken: async () => (await getSession())?.accessToken ?? null,
  getRefreshToken: async () => (await getSession())?.refreshToken ?? null,

  // A 401 rotated the session mid-request. Persist the new pair before the
  // retry goes out, and push the fresh access token into the store so the
  // socket carries it on its next (re)connect.
  onSessionRefreshed: async session => {
    await saveSession(session);
    currentUserStore().setState({ accessToken: session.accessToken });
  },

  // The refresh token is gone or was rejected: this session is over. The
  // Keychain is cleared first so an in-flight request can't resurrect it.
  onSessionExpired: async () => {
    await clearSession();
    currentUserStore().setState({
      accessToken: null,
      authStatus: 'unauthenticated',
      userId: null,
      email: null,
      username: null,
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
