import { ApiClient, type AuthSession } from '@gaming-platform/core';

import type { Config } from '../config';

export type Session = {
  api: ApiClient;
  accessToken: string;
  userId: string;
  username: string | null;
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
  return {
    api,
    accessToken: session.accessToken,
    userId: profile.id,
    username: profile.username,
  };
}

/**
 * Sign in as a seeded bot: a roster username plus the shared BOT_SECRET. The
 * route reaches is_bot accounts only, and exists in production - unlike the
 * test-token route this replaced.
 */
export async function loginBot(
  config: Config,
  username: string,
): Promise<Session> {
  if (!config.secret) {
    throw new Error('BOTS_SECRET is required to sign in; it must match the server BOT_SECRET.');
  }
  const response = await fetch(
    `${config.serverUrl}/api/v1/authentication/bot-login`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-platform': 'web' },
      body: JSON.stringify({ username, secret: config.secret }),
    },
  );
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? `Bot sign-in refused for ${username}: check BOTS_SECRET matches the server BOT_SECRET, and that the roster is seeded.`
        : `Bot sign-in failed for ${username} (${response.status})`,
    );
  }
  return sessionFrom(config, (await response.json()) as AuthSession);
}
