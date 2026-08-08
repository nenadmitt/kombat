import { ApiError, WalletNetwork } from '@gaming-platform/core';
import {
  ArrowClockwise,
  Check,
  Copy,
  Eye,
  EyeSlash,
  Lock,
  ShieldCheck,
  Vault,
  Warning,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AuthShell } from '../components/AuthShell';
import { apiClient } from '../lib/api';
import { shortAddress } from '../lib/format';
import { useSessionStore } from '../store/session.store';

type Props = {
  /** Called once the player has a wallet and has acknowledged the phrase. */
  onDone: () => void;
  /** Backing out without a wallet - allowed, but re-prompted next visit. */
  onSkip?: () => void;
};

/** Masked lengths for the grid before the words are revealed. */
const MASK = [6, 5, 8, 6, 7, 4, 5, 9, 6, 5, 7, 6];

type SetUp = { address: string; mnemonic: string } | null;

/**
 * The whole "does this account need a wallet, and here it is" question,
 * answered once per page load and shared across mounts.
 *
 * StrictMode runs effects twice. Checking and creating separately meant the
 * second run listed wallets, found the one the first run had just created,
 * concluded the account already had a wallet and skipped the screen - so the
 * player was sent to the lobby and never saw their phrase. Both runs now
 * await the same answer.
 *
 * Null means the wallet genuinely predates this flow, and its phrase is gone
 * for good: it is returned once, at creation.
 */
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

/**
 * The wallet step for a web account. The key is held by the platform,
 * encrypted, so nothing is stored in this browser: the phrase is the player's
 * own backup, and the account keeps working whether or not they save it.
 */
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
        // A wallet from before this flow: nothing left to show.
        onDone();
        return;
      }
      setWords(created.mnemonic.split(' '));
      setAddress(created.address);
      // The subname is minted with the username but only points somewhere once
      // the wallet exists, so the fresh profile is what carries it.
      try {
        setUser(await apiClient.getCurrentUser());
      } catch {
        // The name is a nicety here; the wallet is what mattered.
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
    <AuthShell
      step={2}
      title={['Your wallet', 'is ready.']}
      lead="We created it with your account. It holds your stake, and winnings land in it."
      points={[
        { icon: Vault, label: 'Your stake and winnings sit here' },
        { icon: ShieldCheck, label: 'We keep the key, so there is nothing to install' },
        { icon: Warning, label: 'Anyone with the phrase controls the wallet' },
      ]}
    >
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
          {/* Never a dead end: the lobby works, staking is what needs a wallet. */}
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
    </AuthShell>
  );
}
