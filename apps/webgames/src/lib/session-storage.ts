import type { AuthSession } from '@gaming-platform/core';

const ACCESS_KEY = 'kombat.accessToken';
const REFRESH_KEY = 'kombat.refreshToken';
const COLOR_KEY = 'kombat.avatarColor';
const WELCOME_KEY = 'kombat.welcomeBonus';

/**
 * The refresh token is a login credential, and a browser has nowhere better
 * than localStorage to put one. Same trade-off every wallet-adjacent web app
 * makes; the token is single-use and rotates on every refresh.
 */
export const sessionStorage = {
  read(): AuthSession | null {
    const accessToken = localStorage.getItem(ACCESS_KEY);
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    return accessToken && refreshToken ? { accessToken, refreshToken } : null;
  },

  write(session: AuthSession): void {
    localStorage.setItem(ACCESS_KEY, session.accessToken);
    localStorage.setItem(REFRESH_KEY, session.refreshToken);
  },

  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },

  readColor(): string | null {
    return localStorage.getItem(COLOR_KEY);
  },

  writeColor(color: string): void {
    localStorage.setItem(COLOR_KEY, color);
  },

  /** Null until the user has either taken or waved off the welcome bonus. */
  readWelcomeBonus(userId: string): string | null {
    return localStorage.getItem(`${WELCOME_KEY}:${userId}`);
  },

  writeWelcomeBonus(userId: string, outcome: 'claimed' | 'dismissed'): void {
    localStorage.setItem(`${WELCOME_KEY}:${userId}`, outcome);
  },
};
