import { ApiClient, type AuthSession } from '@gaming-platform/core';

import type { Config } from '../config';

export type Session = {
  api: ApiClient;
  accessToken: string;
  userId: string;
};

/**
 * `web` keeps the client off the mobile platform pin and out of the store
 * version floor, so a bot never needs a release to keep working.
 */
function clientFor(config: Config, tokenRef: { value: string | null }): ApiClient {
  return new ApiClient({
    baseUrl: config.serverUrl,
    appPlatform: 'web',
    getAccessToken: async () => tokenRef.value,
  });
}

/** An unauthenticated client, for the login calls themselves. */
export function anonymousClient(config: Config): ApiClient {
  return clientFor(config, { value: null });
}

export async function sessionFrom(
  config: Config,
  session: AuthSession,
): Promise<Session> {
  const api = clientFor(config, { value: session.accessToken });
  const profile = await api.getCurrentUser();
  return { api, accessToken: session.accessToken, userId: profile.id };
}

/**
 * Sign in as an existing bot. Only test-otp is supported at runtime: it needs
 * no stored secret, and the route is absent in production anyway.
 */
export async function loginTestOtp(
  config: Config,
  email: string,
): Promise<Session> {
  const anon = anonymousClient(config);
  const { token } = await requestTestToken(config, email);
  const session = await anon.exchangeLoginToken(email, token);
  return sessionFrom(config, session);
}

/** Not on ApiClient: the route exists only on non-production servers. */
export async function requestTestToken(
  config: Config,
  email: string,
): Promise<{ token: string }> {
  const response = await fetch(
    `${config.serverUrl}/api/v1/authentication/request-token/test`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-platform': 'web' },
      body: JSON.stringify({ email }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Test login token request failed (${response.status}). This route only exists on non-production servers.`,
    );
  }
  return (await response.json()) as { token: string };
}

/** Marks a provisioned account as a bot through the operator surface. */
export async function markAsBot(
  config: Config,
  userId: string,
): Promise<void> {
  if (!config.adminToken) {
    throw new Error(
      'BOTS_ADMIN_TOKEN is required to mark accounts as bots; an unflagged bot would show up in the rankings.',
    );
  }
  const response = await fetch(
    `${config.serverUrl}/api/v1/admin/users/${userId}/bot`,
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-admin-token': config.adminToken,
      },
      body: JSON.stringify({ isBot: true }),
    },
  );
  if (!response.ok) {
    throw new Error(`Marking ${userId} as a bot failed (${response.status})`);
  }
}
