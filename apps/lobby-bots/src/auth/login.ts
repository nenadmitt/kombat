import { ApiClient, type AuthSession } from '@gaming-platform/core';

import type { Config } from '../config';

export type Session = {
  api: ApiClient;
  accessToken: string;
  userId: string;
  username: string | null;
};

// `web` skips the mobile version pin, so a bot never needs a release to keep working.
function clientFor(config: Config, tokenRef: { value: string | null }): ApiClient {
  return new ApiClient({
    baseUrl: config.serverUrl,
    appPlatform: 'web',
    getAccessToken: async () => tokenRef.value,
  });
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
    const body = await response.text().catch(() => '');
    // The server makes a wrong secret and an unseeded name indistinguishable on purpose.
    throw new Error(
      response.status === 401
        ? `Bot sign-in refused for ${username} (401 ${body}). Either BOTS_SECRET != server BOT_SECRET, or the roster is not seeded (POST /admin/bots/seed). The server log says which: "Bot sign-in is disabled" = server secret unset/short, "Invalid bot credentials" = mismatch or unseeded.`
        : `Bot sign-in failed for ${username}: ${response.status} ${body} at ${config.serverUrl}`,
    );
  }
  return sessionFrom(config, (await response.json()) as AuthSession);
}
