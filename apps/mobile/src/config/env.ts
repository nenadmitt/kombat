import Config from 'react-native-config';

/**
 * Typed, validated access to build-time env vars (from `.env` via
 * react-native-config). Client-safe values only — secrets never live here.
 */
export function required(key: keyof typeof Config): string {
  const value = Config[key];
  if (!value) {
    throw new Error(
      `Missing env var ${String(key)}. Add it to apps/mobile/.env (see .env.example) and rebuild the app.`,
    );
  }
  return value;
}

export const env = {
  // Add client-safe build-time env vars here, e.g.:
  // apiUrl: required('API_URL'),
};
