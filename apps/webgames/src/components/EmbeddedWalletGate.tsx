import { useEffect, useRef } from 'react';
import { useAccount, useConnect } from 'wagmi';

import { apiClient } from '../lib/api';
import { EMBEDDED_CONNECTOR_ID, embeddedWallet } from '../lib/embedded-wallet';
import { useSessionStore } from '../store/session.store';

export function EmbeddedWalletGate() {
  const hasSession = useSessionStore(s => s.hasSession);
  const hasWallet = useSessionStore(s => s.hasWallet);
  const custodial = useSessionStore(s => s.walletIsCustodial);
  const { isConnected } = useAccount();
  const { connect } = useConnect();
  const attempted = useRef(false);

  useEffect(() => {
    if (!hasSession || !custodial || hasWallet !== true) return;
    // A wallet the player connected themselves wins: never displace it.
    if (isConnected || attempted.current) return;
    attempted.current = true;

    void apiClient
      .getEmbeddedWalletKey()
      .then(({ privateKey }) => {
        // Built per session from a key, so it is not one of the config's declared connectors.
        connect({
          connector: embeddedWallet(privateKey as `0x${string}`),
        } as Parameters<typeof connect>[0]);
      })
      .catch(() => {
        // The wallet page reports the disconnected state.
        attempted.current = false;
      });
  }, [hasSession, custodial, hasWallet, isConnected, connect]);

  return null;
}

export { EMBEDDED_CONNECTOR_ID };
