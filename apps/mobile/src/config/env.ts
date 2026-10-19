import Config from 'react-native-config';

function required(key: keyof typeof Config): string {
  const value = Config[key];
  if (!value) {
    throw new Error(
      `Missing env var ${String(key)}. Add it to apps/mobile/.env (see .env.example) and rebuild the app.`,
    );
  }
  return value;
}

function optional(key: keyof typeof Config): string | null {
  return Config[key] || null;
}

export const env = {
  apiBaseUrl: required('API_BASE_URL'),
  alchemyToken: required('ALCHEMY_TOKEN'),
  maintenanceDetailsUrl: optional('MAINTENANCE_DETAILS_URL'),
  /** When set, a server-supplied deposit target that differs is refused. */
  stakePotAddressPin: optional('STAKE_POT_ADDRESS_PIN'),
};
