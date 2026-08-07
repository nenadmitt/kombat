import {
  ApiError,
  formatStakeAmount,
  StakeAsset,
} from '@gaming-platform/core';
import { useState } from 'react';

import { apiClient } from '../lib/api';
import { EXPLORER_URL } from '../lib/chain';
import { usePotStore } from '../store/pot.store';

type Step = 'offer' | 'confirmClose' | 'sent';

type Props = {
  /** Base-unit grant, straight from the server. */
  amount: string;
  symbol: string;
  onClaimed: () => void;
  onDismissed: () => void;
  onClose: () => void;
};

export function WelcomeBonusModal({
  amount,
  symbol,
  onClaimed,
  onDismissed,
  onClose,
}: Props) {
  const [step, setStep] = useState<Step>('offer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // The watcher credits the pot when the grant's Staked event lands and the
  // balance push updates this store; that is the confirmation signal.
  const potKombat = usePotStore(s => s.balances.available[StakeAsset.Kombat]);
  const confirmed = txHash !== null && BigInt(potKombat ?? '0') > 0n;

  const label = `${formatStakeAmount(amount, StakeAsset.Kombat)} ${symbol}`;

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiClient.claimWelcomeBonus();
      setTxHash(result.txHash);
      onClaimed();
      setStep('sent');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Nothing left to offer - never show this again.
        onClaimed();
        onClose();
        return;
      }
      setError(
        err instanceof Error ? err.message : 'The claim failed. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  function requestClose() {
    // An error already cost them the offer's promise; do not nag.
    if (error) {
      onDismissed();
      onClose();
      return;
    }
    setStep('confirmClose');
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        {step === 'offer' && (
          <>
            <CoinPile />
            <span className="card-label-gold">WELCOME BONUS</span>
            <h2 className="modal-title">
              Your first stake
              <br />
              is on us
            </h2>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 'var(--s-2)',
              }}
            >
              <span
                style={{
                  fontWeight: 800,
                  fontSize: 44,
                  lineHeight: 1,
                  letterSpacing: '-0.035em',
                  color: 'var(--gold)',
                }}
              >
                {formatStakeAmount(amount, StakeAsset.Kombat)}
              </span>
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--gold)' }}>
                {symbol}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
              Claimed straight into your stake pot, ready to play staked
              matches with.
            </p>
            {error && <div className="banner">{error}</div>}
            <button
              type="button"
              className="btn btn-gold btn-block btn-lg"
              onClick={claim}
              disabled={busy}
            >
              {busy ? <span className="spinner" /> : `Claim ${label}`}
            </button>
            <button type="button" className="pill" onClick={requestClose}>
              {error ? 'Close' : 'Maybe later'}
            </button>
          </>
        )}

        {step === 'confirmClose' && (
          <>
            <h2 className="modal-title">Lose the free coins?</h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
              Closing this forfeits the {label} welcome bonus. You will not be
              able to claim it later.
            </p>
            <button
              type="button"
              className="btn btn-gold btn-block btn-lg"
              onClick={() => setStep('offer')}
            >
              Keep my bonus
            </button>
            <button
              type="button"
              className="pill"
              onClick={() => {
                onDismissed();
                onClose();
              }}
            >
              Close and lose it
            </button>
          </>
        )}

        {step === 'sent' && (
          <>
            <CoinPile />
            <span className="card-label-gold">WELCOME BONUS</span>
            <h2 className="modal-title">
              {confirmed ? `${label} is in your pot` : 'Your bonus is on the way'}
            </h2>
            {!confirmed && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--s-3)',
                  fontSize: 12.5,
                  color: 'var(--text-3)',
                }}
              >
                <span className="spinner" />
                Waiting for on-chain confirmation
              </div>
            )}
            {txHash && (
              <a
                href={`${EXPLORER_URL}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="mono"
                style={{ fontSize: 12 }}
              >
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </a>
            )}
            <button
              type="button"
              className="btn btn-gold btn-block btn-lg"
              onClick={onClose}
            >
              {confirmed ? 'Start playing' : 'Continue in the background'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** The pot illustration from the wallet screen, reused at modal scale. */
function CoinPile() {
  return (
    <svg
      viewBox="0 0 132 108"
      width="176"
      height="144"
      fill="none"
      aria-hidden
      style={{ alignSelf: 'center' }}
    >
      <ellipse cx="66" cy="99" rx="46" ry="5" fill="var(--gold)" opacity="0.1" />
      <circle cx="24" cy="94" r="6" fill="var(--gold)" opacity="0.85" />
      <circle cx="107" cy="96" r="5" fill="var(--gold)" opacity="0.8" />
      <path
        d="M18,50 C18,44 114,44 114,50 L104,86 C101,96 31,96 28,86 Z"
        fill="#191c2a"
        stroke="rgba(245,184,41,.34)"
        strokeWidth="1.5"
      />
      <ellipse
        cx="66"
        cy="49"
        rx="48"
        ry="9"
        fill="#23273a"
        stroke="rgba(245,184,41,.4)"
        strokeWidth="1.5"
      />
      <ellipse cx="66" cy="50" rx="40" ry="6" fill="#0d1019" opacity="0.85" />
      <circle cx="45" cy="46" r="7.5" fill="var(--gold)" />
      <circle cx="63" cy="48" r="8" fill="var(--gold)" />
      <circle cx="81" cy="46" r="7.5" fill="var(--gold)" />
      <circle cx="54" cy="38" r="7" fill="var(--gold)" />
      <circle cx="72" cy="37" r="7" fill="var(--gold)" />
      <circle cx="63" cy="30" r="6.5" fill="var(--gold)" />
    </svg>
  );
}
