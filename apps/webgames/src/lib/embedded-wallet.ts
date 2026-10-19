import { createWalletClient, http, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createConnector } from 'wagmi';

import { chain } from './wagmi';

export const EMBEDDED_CONNECTOR_ID = 'kombat-embedded';

// The key lives in memory only; the server is the durable copy, refetched on sign-in.
export function embeddedWallet(privateKey: Hex) {
  const account = privateKeyToAccount(privateKey);

  return createConnector(config => ({
    id: EMBEDDED_CONNECTOR_ID,
    name: 'Kombat wallet',
    type: 'embedded',

    async setup() {},

    // Cast: wagmi's connect is generic over capability reporting, which a local account lacks.
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

    async getClient({ chainId }: { chainId?: number } = {}) {
      const target =
        config.chains.find(candidate => candidate.id === chainId) ?? chain;
      return createWalletClient({ account, chain: target, transport: http() });
    },

    async getProvider() {
      return undefined;
    },

    // Always authorized: the key is only fetched once the account is signed in.
    async isAuthorized() {
      return true;
    },

    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }));
}
