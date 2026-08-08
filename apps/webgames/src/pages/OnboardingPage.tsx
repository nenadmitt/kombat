import {
  ApiError,
  isValidReferralCode,
  normalizeReferralCode,
} from '@gaming-platform/core';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { apiClient } from '../lib/api';
import { initialOf } from '../lib/format';
import { sessionStorage } from '../lib/session-storage';
import { useSessionStore } from '../store/session.store';
import { WalletSetupPage } from './WalletSetupPage';

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

/** Local-only avatar tints, exactly as the mobile app treats them. */
const AVATAR_COLORS = ['#8ee05a', '#f5b829', '#3ee08f', '#8aa0f5'];

export function OnboardingPage() {
  const navigate = useNavigate();
  const { user, setUser, hasWallet, setHasWallet, dismissWalletPrompt } =
    useSessionStore();

  const [username, setUsername] = useState('');
  const [referral, setReferral] = useState('');
  const [color, setColor] = useState(
    () => sessionStorage.readColor() ?? AVATAR_COLORS[0]!,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsWallet, setNeedsWallet] = useState(false);

  // A returning email user with no wallet re-enters at the wallet step: the
  // username screen is done, and the account is meant to end up with exactly
  // one custodial wallet attached.
  const resumeWalletStep =
    Boolean(user?.username) && Boolean(user?.email) && hasWallet === false;

  if (needsWallet || resumeWalletStep) {
    return (
      <WalletSetupPage
        onDone={() => {
          // Custodial: the gate loads its key and connects on the next render.
          setHasWallet(true, true);
          navigate('/lobby', { replace: true });
        }}
        onSkip={() => {
          dismissWalletPrompt();
          navigate('/lobby', { replace: true });
        }}
      />
    );
  }

  if (user?.username) return <Navigate to="/lobby" replace />;

  const nameValid = USERNAME_PATTERN.test(username.trim());
  const referralEntered = referral.trim().length > 0;
  const referralValid = !referralEntered || isValidReferralCode(referral);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await apiClient.updateUsername(
        username.trim(),
        referralEntered ? normalizeReferralCode(referral) : undefined,
      );
      sessionStorage.writeColor(color);

      // A player who signed in with a wallet already has one; an email account
      // needs the platform to mint it before they can stake or be paid out.
      const wallets = await apiClient.listWallets();
      const mustSetUpWallet = Boolean(updated.email) && wallets.length === 0;

      // Order matters: setUser is what satisfies the "username done" redirect,
      // so the wallet step has to be armed before it, or the render between
      // the two sends the player to the lobby and the step never mounts.
      setHasWallet(
        wallets.length > 0,
        wallets.some(wallet => wallet.custodial),
      );
      if (mustSetUpWallet) {
        setNeedsWallet(true);
      }
      setUser(updated);
      if (!mustSetUpWallet) {
        navigate('/lobby', { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="solo">
      <form className="solo-card" onSubmit={submit}>
        <div>
          <h1 className="page-title">Pick a handle</h1>
          <p style={{ color: 'var(--text-2)', marginTop: 'var(--s-3)' }}>
            This is how opponents see you. It also mints your
            <span style={{ color: 'var(--lime)' }}> .playkombat.xyz </span>
            name, so choose carefully - it never changes.
          </p>
        </div>

        <div
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)' }}
        >
          <span
            className="avatar"
            style={{ width: 56, height: 56, fontSize: 24, background: color }}
          >
            {initialOf(username || 'K')}
          </span>
          <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
            {AVATAR_COLORS.map(option => (
              <button
                key={option}
                type="button"
                aria-label={`Avatar colour ${option}`}
                onClick={() => setColor(option)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 'var(--r-pill)',
                  background: option,
                  boxShadow:
                    option === color ? '0 0 0 2px var(--surface), 0 0 0 4px var(--text)' : 'none',
                }}
              />
            ))}
          </div>
        </div>

        <label style={{ display: 'block' }}>
          <span className="card-label">USERNAME</span>
          <input
            className="input"
            style={{ marginTop: 'var(--s-2)' }}
            value={username}
            onChange={event => setUsername(event.target.value)}
            placeholder="3 to 20 letters, numbers or underscores"
            autoFocus
          />
        </label>

        <label style={{ display: 'block' }}>
          <span className="card-label">INVITE CODE (OPTIONAL)</span>
          <input
            className="input"
            style={{ marginTop: 'var(--s-2)' }}
            value={referral}
            onChange={event => setReferral(event.target.value)}
            placeholder="ABC123"
          />
        </label>

        {!referralValid && (
          <div className="banner">That invite code is not complete.</div>
        )}
        {error && <div className="banner">{error}</div>}

        <button
          type="submit"
          className="btn btn-lime btn-block btn-lg"
          disabled={!nameValid || !referralValid || busy}
        >
          {busy ? <span className="spinner" /> : 'Enter the lobby'}
        </button>
      </form>
    </div>
  );
}
