import { ApiError, WalletNetwork } from '@gaming-platform/core';
import {
  ArrowClockwise,
  Copy,
  Check,
  Eye,
  ShieldCheck,
  Vault,
  Warning,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';

import { AuthShell } from '../components/AuthShell';
import { apiClient } from '../lib/api';

type Props = {
  /** Called once the player has a wallet and has acknowledged the phrase. */
  onDone: () => void;
};

/**
 * The wallet step for a web account. The key itself is held by the platform,
 * encrypted, so nothing is stored in this browser: the phrase is shown once as
 * the player's own backup, and the account works whether or not they keep it.
 */
export function WalletSetupPage({ onDone }: Props) {
  const [words, setWords] = useState<string[] | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const create = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const wallets = await apiClient.listWallets();
      if (wallets.length > 0) {
        // Already has one (a resumed onboarding, or a connected wallet). The
        // phrase was returned once, at creation, and cannot be shown again.
        onDone();
        return;
      }
      const created = await apiClient.createWallet(WalletNetwork.Ethereum);
      setWords(created.mnemonic.split(' '));
      setAddress(created.address);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not set up your wallet.',
      );
    } finally {
      setBusy(false);
    }
  }, [onDone]);

  useEffect(() => {
    void create();
  }, [create]);

  async function copy() {
    if (!words) return;
    await navigator.clipboard.writeText(words.join(' '));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <AuthShell
      step={2}
      title={['Your wallet', 'is ready.']}
      lead="This is where your stake sits and where winnings land. We keep the key for you, so there is nothing to install."
      points={[
        { icon: Vault, label: 'Stakes are held in the pot until a match settles' },
        { icon: ShieldCheck, label: 'The recovery phrase is shown once, here' },
        { icon: Warning, label: 'Anyone with the phrase can move the funds' },
      ]}
    >
      <h2 className="auth-heading">Save your recovery phrase</h2>
      <p className="auth-sub">
        Twelve words that control the wallet. Write them down and keep them off
        this machine. We cannot show them to you again.
      </p>

      {error ? (
        <>
          <div className="banner">{error}</div>
          <button type="button" className="btn btn-lime btn-block btn-lg" onClick={() => void create()}>
            <ArrowClockwise size={18} />
            Try again
          </button>
          {/* Never a dead end: the lobby works without the phrase saved. */}
          <button type="button" className="btn btn-surface btn-block" onClick={onDone}>
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
          <div className={revealed ? 'seed-grid' : 'seed-grid is-hidden'}>
            {(words ?? []).map((word, i) => (
              <span key={word + i} className="seed-word">
                <span className="seed-index">{i + 1}</span>
                {revealed ? word : '••••••'}
              </span>
            ))}
          </div>

          <div className="seed-actions">
            <button
              type="button"
              className="btn btn-surface btn-block"
              onClick={() => setRevealed(r => !r)}
            >
              <Eye size={16} />
              {revealed ? 'Hide' : 'Reveal'}
            </button>
            <button
              type="button"
              className="btn btn-surface btn-block"
              onClick={() => void copy()}
              disabled={!revealed}
            >
              {copied ? <Check size={16} color="var(--win)" /> : <Copy size={16} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          {address && (
            <p className="auth-note">
              <Vault size={14} />
              <span className="mono">{address}</span>
            </p>
          )}

          <label className="seed-confirm">
            <input
              type="checkbox"
              checked={saved}
              onChange={event => setSaved(event.target.checked)}
            />
            I have written the phrase down somewhere safe
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
