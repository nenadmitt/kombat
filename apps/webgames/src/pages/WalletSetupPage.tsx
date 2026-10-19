import { ApiError, WalletNetwork } from '@gaming-platform/core';
import {
  ArrowClockwise,
  Check,
  Copy,
  Eye,
  EyeSlash,
  Lock,
  Warning,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { OnboardingSteps } from '../components/OnboardingSteps';
import { apiClient } from '../lib/api';
import { shortAddress } from '../lib/format';
import { useSessionStore } from '../store/session.store';

type Props = {
  onDone: () => void;
  onSkip?: () => void;
};

const MASK = [6, 5, 8, 6, 7, 4, 5, 9, 6, 5, 7, 6];

type SetUp = { address: string; mnemonic: string } | null;

// Shared across mounts: StrictMode runs effects twice and a second run would skip the phrase.
// Null means the wallet predates this flow; its phrase is only returned at creation.
let setUpInFlight: Promise<SetUp> | null = null;

function setUpWalletOnce(): Promise<SetUp> {
  if (!setUpInFlight) {
    setUpInFlight = (async () => {
      const wallets = await apiClient.listWallets();
      if (wallets.length > 0) {
        return null;
      }
      return apiClient.createWallet(WalletNetwork.Ethereum);
    })();
  }
  return setUpInFlight;
}

export function WalletSetupPage({ onDone, onSkip }: Props) {
  const { user, setUser } = useSessionStore();

  const [words, setWords] = useState<string[] | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<'phrase' | 'address' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const create = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await setUpWalletOnce();
      if (!created) {
        onDone();
        return;
      }
      setWords(created.mnemonic.split(' '));
      setAddress(created.address);
      // The subname only resolves once the wallet exists, so the fresh profile carries it.
      try {
        setUser(await apiClient.getCurrentUser());
      } catch {
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not set up your wallet.',
      );
    } finally {
      setBusy(false);
    }
  }, [onDone, setUser]);

  useEffect(() => {
    void create();
  }, [create]);

  async function copy(what: 'phrase' | 'address') {
    const text = what === 'phrase' ? words?.join(' ') : address;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="solo">
      <div className="solo-card is-wide">
        <OnboardingSteps step={2} />
        {error ? (
        <>
          <h2 className="auth-heading">That did not work</h2>
          <div className="banner">{error}</div>
          <button
            type="button"
            className="btn btn-lime btn-block btn-lg"
            onClick={() => void create()}
          >
            <ArrowClockwise size={18} />
            Try again
          </button>
          <button
            type="button"
            className="btn btn-surface btn-block"
            onClick={onSkip ?? onDone}
          >
            Skip for now
          </button>
        </>
      ) : busy ? (
        <div className="seed-loading">
          <span className="spinner-ring" />
          <span className="card-label">CREATING YOUR WALLET</span>
        </div>
      ) : (
        <>
          <h2 className="auth-heading">We made you a wallet</h2>
          <p className="auth-sub">
            Here is your address and your Kombat name. Save the phrase below and
            you can restore the wallet anywhere.
          </p>

          {user?.ensName && (
            <div className="wallet-fact">
              <span className="wallet-fact-label">YOUR NAME</span>
              <span className="wallet-fact-value is-lime">{user.ensName}</span>
            </div>
          )}

          <button
            type="button"
            className="wallet-fact is-button"
            onClick={() => void copy('address')}
          >
            <span className="wallet-fact-label">ADDRESS</span>
            <span className="wallet-fact-value mono">
              {address ? shortAddress(address) : ''}
            </span>
            {copied === 'address' ? (
              <Check size={15} color="var(--win)" />
            ) : (
              <Copy size={15} color="var(--lime)" />
            )}
          </button>

          <div className="seed-head">
            <span className="card-label">RECOVERY PHRASE</span>
            <span className="seed-chip">
              <Lock size={11} weight="fill" />
              KEEP SECRET
            </span>
          </div>

          <div className="seed-grid">
            {(revealed && words ? words : MASK).map((word, i) => (
              <span key={i} className="seed-word">
                <span className="seed-index">{i + 1}</span>
                {revealed && words
                  ? (word as string)
                  : '•'.repeat(word as number)}
              </span>
            ))}
          </div>

          <div className="seed-actions">
            <button
              type="button"
              className="btn btn-surface btn-block"
              onClick={() => setRevealed(r => !r)}
            >
              {revealed ? <EyeSlash size={16} /> : <Eye size={16} />}
              {revealed ? 'Hide' : 'Reveal'}
            </button>
            <button
              type="button"
              className="btn btn-surface btn-block"
              onClick={() => void copy('phrase')}
              disabled={!revealed}
            >
              {copied === 'phrase' ? (
                <Check size={16} color="var(--win)" />
              ) : (
                <Copy size={16} />
              )}
              {copied === 'phrase' ? 'Copied' : 'Copy'}
            </button>
          </div>

          <p className="seed-warning">
            <Warning size={16} color="var(--gold)" />
            Never share this phrase. Anyone with it controls your wallet.
          </p>

          <label className="seed-confirm">
            <input
              type="checkbox"
              checked={saved}
              onChange={event => setSaved(event.target.checked)}
            />
            I have saved my recovery phrase
          </label>

          <button
            type="button"
            className="btn btn-lime btn-block btn-lg"
            disabled={!saved}
            onClick={onDone}
          >
            Enter the lobby
          </button>
        </>
        )}
      </div>
    </div>
  );
}
