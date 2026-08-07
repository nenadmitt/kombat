/** Production by default, like the mobile build: a missing env must not
 *  silently point a deployed client at localhost. */
const DEFAULT_API_URL = 'https://api.playkombat.xyz';

/** Reown (WalletConnect) project id. Public by design - it identifies the app
 *  to the relay, and a mobile browser has no injected wallet without it. */
const DEFAULT_WALLETCONNECT_PROJECT_ID = '33f99a6011096e6aeaff9e4cc066e83e';

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_URL ?? DEFAULT_API_URL,
  walletConnectProjectId:
    import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
    DEFAULT_WALLETCONNECT_PROJECT_ID,
};
