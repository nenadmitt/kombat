import {
  ApiError,
  formatStakeAmount,
  GameType,
  parseStakeAmount,
  STAKE_ASSET_SYMBOLS,
  STAKE_PRESETS,
  STAKEABLE_ASSETS,
  StakeAsset,
  type GameRoomSummary,
} from '@gaming-platform/core';
import { useState } from 'react';

import { apiClient } from '../lib/api';
import { usePotStore } from '../store/pot.store';

type Props = {
  onClose: () => void;
  onCreated: (room: GameRoomSummary) => void;
};

/** Triple Cut only: the other arenas have no web client to play them in. */
export function CreateRoomModal({ onClose, onCreated }: Props) {
  const { balances, enabled: potEnabled } = usePotStore();
  const [staked, setStaked] = useState(false);
  const [asset, setAsset] = useState<StakeAsset>(StakeAsset.Usdc);
  const [amount, setAmount] = useState<number>(STAKE_PRESETS[2]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = balances.available[asset] ?? '0';
  const stakeBase = staked ? parseStakeAmount(String(amount), asset) : null;
  const tooPoor = stakeBase !== null && BigInt(available) < BigInt(stakeBase);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const room = await apiClient.createGameRoom(
        GameType.TripleCut,
        stakeBase ? { token: asset, amount: stakeBase } : undefined,
        isPrivate,
      );
      onCreated(room);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not create the room.',
      );
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={event => event.stopPropagation()}>
        <h2 className="modal-title">New Triple Cut room</h2>
        <p style={{ color: 'var(--text-2)', margin: 0, fontSize: 13 }}>
          Best of five. First to three rounds takes the pot.
        </p>

        <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
          <button
            type="button"
            className={staked ? 'pill' : 'pill is-active'}
            onClick={() => setStaked(false)}
          >
            Free
          </button>
          <button
            type="button"
            className={staked ? 'pill is-active' : 'pill'}
            onClick={() => setStaked(true)}
            disabled={!potEnabled}
          >
            Staked
          </button>
        </div>

        {staked && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
              {STAKEABLE_ASSETS.map(option => (
                <button
                  key={option}
                  type="button"
                  className={option === asset ? 'pill is-active' : 'pill'}
                  onClick={() => setAsset(option)}
                >
                  {STAKE_ASSET_SYMBOLS[option]}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
              {STAKE_PRESETS.map(preset => (
                <button
                  key={preset}
                  type="button"
                  className={preset === amount ? 'pill is-active' : 'pill'}
                  onClick={() => setAmount(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="card-label">
              POT BALANCE {formatStakeAmount(available, asset)}{' '}
              {STAKE_ASSET_SYMBOLS[asset]}
            </div>
          </>
        )}

        <label className="radio-line">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={event => setIsPrivate(event.target.checked)}
          />
          <span>Private - joinable by invite code only</span>
        </label>

        {tooPoor && (
          <div className="banner">Not enough in your pot for that stake.</div>
        )}
        {error && <div className="banner">{error}</div>}

        <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
          <button
            type="button"
            className="btn btn-surface btn-block"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-lime btn-block"
            onClick={create}
            disabled={busy || tooPoor}
          >
            {busy ? <span className="spinner" /> : 'Create room'}
          </button>
        </div>
      </div>
    </div>
  );
}
