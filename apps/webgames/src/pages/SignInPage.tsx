import { ApiError } from '@gaming-platform/core';
import { ConnectKitButton } from 'connectkit';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { createSiweMessage } from 'viem/siwe';
import { useAccount, useSignMessage, useSwitchChain } from 'wagmi';

import { CHAIN_ID, CHAIN_NAME } from '../lib/chain';
import { BrandMark } from '../components/BrandMark';
import { apiClient } from '../lib/api';
import { useSessionStore } from '../store/session.store';

export function SignInPage() {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const { hasSession, user, signIn } = useSessionStore();
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hasSession && user) {
    return <Navigate to={user.username ? '/lobby' : '/onboarding'} replace />;
  }

  const wrongChain = Boolean(address) && chainId !== CHAIN_ID;

  async function switchToChain() {
    setSwitching(true);
    setError(null);
    try {
      await switchChainAsync({ chainId: CHAIN_ID });
    } catch (err) {
      setError(
        err instanceof Error && err.name === 'UserRejectedRequestError'
          ? 'Network switch rejected.'
          : `Could not switch automatically. Change to ${CHAIN_NAME} in your wallet.`,
      );
    } finally {
      setSwitching(false);
    }
  }

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
          <BrandMark size={32} />
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

              {isConnected &&
                (wrongChain ? (
                  <button
                    type="button"
                    className="btn btn-lime btn-block btn-lg"
                    onClick={switchToChain}
                    disabled={switching}
                  >
                    {switching ? (
                      <span className="spinner" />
                    ) : (
                      `Switch to ${CHAIN_NAME}`
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-lime btn-block btn-lg"
                    onClick={authenticate}
                    disabled={busy}
                  >
                    {busy ? <span className="spinner" /> : 'Sign in'}
                  </button>
                ))}
            </div>
          )}
        </ConnectKitButton.Custom>

        {wrongChain && (
          <div className="banner">
            Kombat runs on {CHAIN_NAME}. Your wallet is on another network.
          </div>
        )}
        {error && <div className="banner">{error}</div>}
      </div>
    </div>
  );
}
