import { createWalletClient, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createConnector } from 'wagmi';

import { chain } from './wagmi';

export const EMBEDDED_CONNECTOR_ID = 'kombat-embedded';

/**
 * The platform-held wallet, as a wagmi connector.
 *
 * An email account has no browser extension to connect, but everything
 * downstream - balances, pot deposits, permits - is written against wagmi. So
 * the key is loaded into a local account and handed to wagmi as a connector,
 * and the rest of the app cannot tell the difference between this and a
 * wallet the player brought themselves.
 *
 * The key lives in memory for the session only. It is never written to
 * storage: the server is the durable copy, and the browser refetches it on
 * the next sign-in.
 */
export function embeddedWallet(privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);

  return createConnector(config => ({
    id: EMBEDDED_CONNECTOR_ID,
    name: 'Kombat wallet',
    type: 'embedded',

    async setup() {},

    // Cast: wagmi's connect signature is generic over capability reporting,
    // which a local account does not implement.
    connect: (async (parameters?: { chainId?: number }) => ({
      accounts: [account.address] as readonly Address[],
      chainId: parameters?.chainId ?? chain.id,
    })) as never,

    async disconnect() {},

    async getAccounts() {
      return [account.address] as readonly Address[];
    },

    async getChainId() {
      return chain.id;
    },

    /** wagmi signs through this: a plain local-account wallet client. */
    async getClient({ chainId }: { chainId?: number } = {}) {
      const target =
        config.chains.find(candidate => candidate.id === chainId) ?? chain;
      return createWalletClient({ account, chain: target, transport: http() });
    },

    async getProvider() {
      return undefined;
    },

    // The session decides this, not the connector: the key is only fetched
    // once the account is signed in, so a live instance is always authorized.
    async isAuthorized() {
      return true;
    },

    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }));
}
