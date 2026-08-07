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

import { GameIcon } from './GameIcon';
import { apiClient } from '../lib/api';
import { GAME_LABELS, WEB_PLAYABLE_GAMES } from '../lib/format';
import { usePotStore } from '../store/pot.store';

type Props = {
  onClose: () => void;
  onCreated: (room: GameRoomSummary) => void;
};

/** Only the arenas with a web board: the rest have nothing to play them in. */
export function CreateRoomModal({ onClose, onCreated }: Props) {
  const { balances, enabled: potEnabled } = usePotStore();
  const [gameType, setGameType] = useState<GameType>(WEB_PLAYABLE_GAMES[0]!);
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
        gameType,
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
        <h2 className="modal-title">Open a room</h2>

        <div className="bs-powerups">
          {WEB_PLAYABLE_GAMES.map(option => (
            <button
              key={option}
              type="button"
              className={
                option === gameType ? 'bs-powerup is-armed' : 'bs-powerup'
              }
              onClick={() => setGameType(option)}
            >
              <GameIcon gameType={option} size={36} />
              <span className="bs-powerup-name">{GAME_LABELS[option]}</span>
            </button>
          ))}
        </div>

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
