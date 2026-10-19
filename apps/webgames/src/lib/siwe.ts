import type { SIWEConfig } from 'connectkit';
import type { Address } from 'viem';
import { createSiweMessage } from 'viem/siwe';
import { getAccount } from 'wagmi/actions';

import { apiClient } from './api';
import { sessionStorage } from './session-storage';
import { wagmiConfig } from './wagmi';
import { useSessionStore } from '../store/session.store';

// The server issues the nonce and mints our JWT in `verifyMessage`.
export const siweConfig: SIWEConfig = {
  getNonce: async () => (await apiClient.requestSiweNonce()).nonce,

  createMessage: ({ nonce, address, chainId }) =>
    createSiweMessage({
      address,
      chainId,
      domain: window.location.host,
      nonce,
      uri: window.location.origin,
      version: '1',
      statement: 'Sign in to Kombat.',
    }),

  verifyMessage: async ({ message, signature }) => {
    const session = await apiClient.verifySiwe(message, signature);
    const { address } = getAccount(wagmiConfig);
    if (address) {
      sessionStorage.writeAddress(address);
    }
    await useSessionStore.getState().signIn(session);
    return true;
  },

  // A bare token is not a session: it must match the connected wallet and be accepted by the server.
  getSession: async () => {
    const { address, chainId } = getAccount(wagmiConfig);
    if (!address || !chainId) return null;
    if (!sessionStorage.read()) return null;
    if (sessionStorage.readAddress() !== address.toLowerCase()) return null;
    if (!useSessionStore.getState().user) return null;
    return { address: address as Address, chainId };
  },

  signOut: async () => {
    await useSessionStore.getState().signOut();
    return true;
  },

  // The server expires nonces after 5 minutes, ConnectKit's default refetch interval, so refetch sooner.
  nonceRefetchInterval: 1000 * 60 * 3,

  // The JWT outlives the wallet connection; only a different wallet ends the session.
  signOutOnDisconnect: false,
  signOutOnAccountChange: true,
  // Switching to the right chain is a fix, not a reason to drop the session.
  signOutOnNetworkChange: false,
};
