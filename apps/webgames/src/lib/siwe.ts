import type { SIWEConfig } from 'connectkit';
import type { Address } from 'viem';
import { createSiweMessage } from 'viem/siwe';
import { getAccount } from 'wagmi/actions';

import { apiClient } from './api';
import { sessionStorage } from './session-storage';
import { wagmiConfig } from './wagmi';
import { useSessionStore } from '../store/session.store';

/**
 * SIWE for ConnectKit's modal: connecting a wallet and signing in are one
 * flow the modal owns, so no screen asks for the signature itself.
 *
 * Unlike a client-verified setup, the server is the authority here - it
 * issues the nonce and returns the session the rest of the app runs on, so
 * `verifyMessage` is where our JWT is minted.
 */
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

  /**
   * A stored token alone is not a session: it has to belong to the wallet that
   * is connected now, and the server has to have accepted it (a `user` on the
   * store). Reporting "signed in" off a bare token is how the modal signs
   * nobody in and the app sits on the sign-in screen.
   */
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

  // The server expires a nonce after 5 minutes, which is exactly ConnectKit's
  // default refetch interval - a nonce fetched on mount can be dead by the
  // time it is signed. Refetch well inside the window instead.
  nonceRefetchInterval: 1000 * 60 * 3,

  // Our session is a server JWT that outlives the wallet connection: a wallet
  // that drops (or has not reconnected yet on a fresh load) must not log the
  // player out mid-match. A different wallet is another account, though.
  signOutOnDisconnect: false,
  signOutOnAccountChange: true,
  // Switching to the right chain is a fix, not a reason to drop the session.
  signOutOnNetworkChange: false,
};
