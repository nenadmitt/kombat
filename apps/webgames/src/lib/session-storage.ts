import type { AuthSession } from '@gaming-platform/core';

const ACCESS_KEY = 'kombat.accessToken';
const REFRESH_KEY = 'kombat.refreshToken';
const ADDRESS_KEY = 'kombat.siweAddress';
const COLOR_KEY = 'kombat.avatarColor';
const WELCOME_KEY = 'kombat.welcomeBonus';

// localStorage is the only option for the refresh token; it is single-use and rotates on refresh.
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
    localStorage.removeItem(ADDRESS_KEY);
  },

  /** The wallet that signed for this session, so another wallet never inherits it. */
  readAddress(): string | null {
    return localStorage.getItem(ADDRESS_KEY);
  },

  writeAddress(address: string): void {
    localStorage.setItem(ADDRESS_KEY, address.toLowerCase());
  },

  readColor(): string | null {
    return localStorage.getItem(COLOR_KEY);
  },

  writeColor(color: string): void {
    localStorage.setItem(COLOR_KEY, color);
  },

  readWelcomeBonus(userId: string): string | null {
    return localStorage.getItem(`${WELCOME_KEY}:${userId}`);
  },

  writeWelcomeBonus(userId: string, outcome: 'claimed' | 'dismissed'): void {
    localStorage.setItem(`${WELCOME_KEY}:${userId}`, outcome);
  },
};
