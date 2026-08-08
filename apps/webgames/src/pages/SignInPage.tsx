import { ApiError } from '@gaming-platform/core';
import { ConnectKitButton, useSIWE } from 'connectkit';
import {
  AppleLogo,
  ArrowLeft,
  CaretRight,
  CheckCircle,
  DiscordLogo,
  Envelope,
  GameController,
  GoogleLogo,
  Robot,
  ShieldCheck,
  Timer,
  Trophy,
  Wallet,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { AuthShell } from '../components/AuthShell';
import { apiClient } from '../lib/api';
import { useSessionStore } from '../store/session.store';

const CODE_LENGTH = 8;
const RESEND_SECONDS = 30;

const SOON: { label: string; icon: Icon }[] = [
  { label: 'Google', icon: GoogleLogo },
  { label: 'Apple', icon: AppleLogo },
  { label: 'Discord', icon: DiscordLogo },
];

export function SignInPage() {
  const { hasSession, user, loading, signIn } = useSessionStore();
  const { isSignedIn, isLoading } = useSIWE();

  const [stage, setStage] = useState<'method' | 'code'>('method');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  async function sendCode(to: string) {
    setBusy(true);
    setError(null);
    try {
      await apiClient.requestLoginToken(to);
      setEmail(to);
      setStage('code');
      setCode('');
      setResendIn(RESEND_SECONDS);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not send that code.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    setBusy(true);
    setError(null);
    try {
      await signIn(await apiClient.exchangeLoginToken(email, value));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'That code did not work.',
      );
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  if (hasSession && user) {
    return <Navigate to={user.username ? '/lobby' : '/onboarding'} replace />;
  }

  // Signed the message, waiting on the server's session: neither "connect"
  // nor "sign in" is true, and offering either would re-run a done step.
  const settling = isLoading || isSignedIn || (hasSession && loading);

  if (stage === 'code') {
    return (
      <AuthShell
        title={['Check your', 'inbox.']}
        lead="We never store a password. Each sign-in uses a fresh eight-character code that expires in fifteen minutes."
        points={[
          { icon: Timer, label: 'The code expires in fifteen minutes' },
          { icon: CheckCircle, label: 'It works once, then it is spent' },
          { icon: Envelope, label: 'Wrong address? Change it and resend' },
        ]}
      >
        <button
          type="button"
          className="auth-back"
          onClick={() => {
            setStage('method');
            setError(null);
          }}
        >
          <ArrowLeft size={16} />
          Other sign-in options
        </button>

        <h2 className="auth-heading">Check your email</h2>
        <p className="auth-sub">
          We sent an eight-character code to <strong>{email}</strong>
          {' · '}
          <button
            type="button"
            className="auth-link"
            onClick={() => setStage('method')}
          >
            change
          </button>
        </p>

        <input
          className="input auth-code"
          value={code}
          onChange={event => {
            // Letters and digits, upper case: the server's alphabet. Stripping
            // to digits made a real code impossible to type or paste.
            const next = event.target.value
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '')
              .slice(0, CODE_LENGTH);
            setCode(next);
            if (next.length === CODE_LENGTH) void verify(next);
          }}
          placeholder="ABCD1234"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={CODE_LENGTH}
          disabled={busy}
          aria-label="Login code"
          autoFocus
        />

        {error && <div className="banner">{error}</div>}

        <button
          type="button"
          className="btn btn-lime btn-block btn-lg"
          disabled={code.length !== CODE_LENGTH || busy}
          onClick={() => void verify(code)}
        >
          {busy ? (
            <span className="spinner" />
          ) : code.length === CODE_LENGTH ? (
            'Sign in'
          ) : (
            'Enter all eight characters'
          )}
        </button>

        <div className="auth-resend">
          <span>Didn't get it? Check spam.</span>
          {resendIn > 0 ? (
            <span className="mono">
              Resend in 0:{String(resendIn).padStart(2, '0')}
            </span>
          ) : (
            <button
              type="button"
              className="auth-link"
              onClick={() => void sendCode(email)}
            >
              Resend code
            </button>
          )}
        </div>

        <div className="auth-rule" />

        <p className="auth-note">
          <Wallet size={14} />
          Next you'll connect or create a wallet - that's where your stake and
          winnings live.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={['Sign in.', 'Then play.']}
      lead="Four arenas in the browser, played live against whoever else is in the lobby. Stake on the match and the winner takes the pot."
      points={[
        {
          icon: GameController,
          label: 'Battleships, Salvo, Triple Cut and Ludo Royale',
        },
        { icon: Trophy, label: 'The winner takes the pot, less a 5% platform fee' },
        { icon: Robot, label: 'Practice against a bot with nothing staked' },
      ]}
    >
      <h2 className="auth-heading">Sign in to Kombat</h2>
      <p className="auth-sub">
        Use the wallet you already play with, or an email - you can add a wallet
        after.
      </p>

      <ConnectKitButton.Custom>
        {({ isConnected, show }) => (
          <button
            type="button"
            className="auth-method is-primary"
            disabled={settling}
            onClick={show}
          >
            <span className="auth-method-icon">
              <Wallet size={20} weight="fill" />
            </span>
            <span className="auth-method-text">
              <span className="auth-method-title">
                {isConnected ? 'Sign in with wallet' : 'Continue with wallet'}
              </span>
              <span className="auth-method-sub">
                MetaMask, WalletConnect or Coinbase
              </span>
            </span>
            <span className="auth-pill is-lime">FASTEST</span>
            {settling ? <span className="spinner" /> : <CaretRight size={16} />}
          </button>
        )}
      </ConnectKitButton.Custom>

      <EmailMethod busy={busy} error={error} onSubmit={sendCode} />

      <div className="auth-or">
        <span>OR</span>
      </div>

      {SOON.map(({ label, icon: Glyph }) => (
        <div key={label} className="auth-method is-soon">
          <span className="auth-method-icon">
            <Glyph size={20} weight="fill" />
          </span>
          <span className="auth-method-text">
            <span className="auth-method-title">{label}</span>
            <span className="auth-method-sub">Coming soon</span>
          </span>
          <span className="auth-pill">SOON</span>
        </div>
      ))}

      <p className="auth-note">
        <ShieldCheck size={14} />
        By continuing you agree to the terms. Test mode runs on Sepolia - no
        real funds at risk.
      </p>
    </AuthShell>
  );
}

/** The email row opens into its own field rather than pushing a new screen. */
function EmailMethod({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (email: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button type="button" className="auth-method" onClick={() => setOpen(true)}>
        <span className="auth-method-icon">
          <Envelope size={20} weight="fill" />
        </span>
        <span className="auth-method-text">
          <span className="auth-method-title">Continue with email</span>
          <span className="auth-method-sub">
            We send an eight-character code, not a password
          </span>
        </span>
        <CaretRight size={16} />
      </button>
    );
  }

  return (
    <form
      className="auth-email"
      onSubmit={event => {
        event.preventDefault();
        if (valid) onSubmit(value.trim());
      }}
    >
      <input
        ref={inputRef}
        className="input"
        type="email"
        placeholder="you@example.com"
        value={value}
        onChange={event => setValue(event.target.value)}
      />
      {error && <div className="banner">{error}</div>}
      <button
        type="submit"
        className="btn btn-lime btn-block btn-lg"
        disabled={!valid || busy}
      >
        {busy ? <span className="spinner" /> : 'Send me a code'}
      </button>
    </form>
  );
}
