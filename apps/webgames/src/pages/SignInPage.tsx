import { ApiError } from '@gaming-platform/core';
import { ConnectKitButton } from 'connectkit';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { createSiweMessage } from 'viem/siwe';
import { useAccount, useSignMessage } from 'wagmi';

import { CHAIN_ID, CHAIN_NAME } from '../lib/chain';
import { apiClient } from '../lib/api';
import { useSessionStore } from '../store/session.store';

export function SignInPage() {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { hasSession, user, signIn } = useSessionStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hasSession && user) {
    return <Navigate to={user.username ? '/lobby' : '/onboarding'} replace />;
  }

  const wrongChain = Boolean(address) && chainId !== CHAIN_ID;

  async function authenticate() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const { nonce } = await apiClient.requestSiweNonce();
      const message = createSiweMessage({
        address,
        chainId: CHAIN_ID,
        domain: window.location.host,
        nonce,
        uri: window.location.origin,
        version: '1',
        statement: 'Sign in to Kombat.',
      });
      const signature = await signMessageAsync({ message });
      await signIn(await apiClient.verifySiwe(message, signature));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error && err.name === 'UserRejectedRequestError'
            ? 'Signature rejected.'
            : 'Could not complete sign-in. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="solo">
      <div className="solo-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
          <svg width="32" height="32" viewBox="0 0 100 100" aria-hidden>
            <path
              d="M28 27 L46.5 27 L42 48 L47 48 L43 74 L28 74 Z"
              fill="#f3f5fe"
            />
            <path
              d="M53 27 L72 27 L72 74 L56 74 L51.5 48 L45.5 48 Z"
              fill="var(--lime)"
            />
          </svg>
          <span className="rail-brand-word" style={{ fontSize: 16 }}>
            KOMBAT
          </span>
        </div>

        <div>
          <h1 className="page-title">Play for stakes</h1>
          <p style={{ color: 'var(--text-2)', marginTop: 'var(--s-3)' }}>
            Connect a wallet and sign one message. No email, no password, no
            custodial keys - your wallet is your account.
          </p>
        </div>

        <ConnectKitButton.Custom>
          {({ isConnected, show, truncatedAddress }) => (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--s-3)',
              }}
            >
              <button
                type="button"
                className={
                  isConnected
                    ? 'btn btn-surface btn-block btn-lg'
                    : 'btn btn-lime btn-block btn-lg'
                }
                onClick={show}
              >
                {isConnected ? truncatedAddress : 'Connect wallet'}
              </button>

              {isConnected && (
                <button
                  type="button"
                  className="btn btn-lime btn-block btn-lg"
                  onClick={authenticate}
                  disabled={busy || wrongChain}
                >
                  {busy ? <span className="spinner" /> : 'Sign in'}
                </button>
              )}
            </div>
          )}
        </ConnectKitButton.Custom>

        {wrongChain && (
          <div className="banner">Switch your wallet to {CHAIN_NAME}.</div>
        )}
        {error && <div className="banner">{error}</div>}
      </div>
    </div>
  );
}
