import Config from 'react-native-config';

/**
 * Typed, validated access to build-time env vars (from `.env` via
 * react-native-config). Client-safe values only - secrets never live here.
 */
function required(key: keyof typeof Config): string {
  const value = Config[key];
  if (!value) {
    throw new Error(
      `Missing env var ${String(key)}. Add it to apps/mobile/.env (see .env.example) and rebuild the app.`,
    );
  }
  return value;
}

/** Optional: absent means the feature that reads it stays hidden. */
function optional(key: keyof typeof Config): string | null {
  return Config[key] || null;
}

export const env = {
  apiBaseUrl: required('API_BASE_URL'),
  alchemyToken: required('ALCHEMY_TOKEN'),
  /** Status/incident page linked from the maintenance banner. */
  maintenanceDetailsUrl: optional('MAINTENANCE_DETAILS_URL'),
};
