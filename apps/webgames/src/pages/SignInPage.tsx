import { ConnectKitButton, useModal, useSIWE } from 'connectkit';
import { Navigate } from 'react-router-dom';

import { BrandMark } from '../components/BrandMark';
import { useSessionStore } from '../store/session.store';

export function SignInPage() {
  const { hasSession, user, loading } = useSessionStore();
  const { isSignedIn, isLoading } = useSIWE();
  const { openSIWE } = useModal();

  if (hasSession && user) {
    return <Navigate to={user.username ? '/lobby' : '/onboarding'} replace />;
  }

  // Signed the message, waiting on the server's session: neither "connect"
  // nor "sign in" is true, and offering either would re-run a done step.
  const settling = isLoading || isSignedIn || (hasSession && loading);

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

        {/* Connecting, the network check and the signature are all steps of
            ConnectKit's own modal, so this page only opens it. */}
        <ConnectKitButton.Custom>
          {({ isConnected, show }) => (
            <button
              type="button"
              className="btn btn-lime btn-block btn-lg"
              // An already-connected wallet lands on ConnectKit's profile
              // screen, which only hints at signing; openSIWE asks outright.
              onClick={() => (isConnected ? openSIWE(true) : show?.())}
              disabled={settling}
            >
              {settling ? (
                <span className="spinner" />
              ) : isConnected ? (
                'Sign in'
              ) : (
                'Connect wallet'
              )}
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    </div>
  );
}
