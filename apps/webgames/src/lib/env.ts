// Production by default: a missing env must not point a deployed client at localhost.
const DEFAULT_API_URL = 'https://api.playkombat.xyz';

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_URL ?? DEFAULT_API_URL,
  walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
};
