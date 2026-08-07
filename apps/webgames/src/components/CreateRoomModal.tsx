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
import { CaretDown, Check, LockSimple } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { GameIcon } from './GameIcon';
import { Field, Segmented, Sheet, Switch } from './ui';
import { apiClient } from '../lib/api';
import { GAME_LABELS, WEB_PLAYABLE_GAMES } from '../lib/format';
import { usePotStore } from '../store/pot.store';

type Props = {
  onClose: () => void;
  onCreated: (room: GameRoomSummary) => void;
};

const DEFAULT_STAKE = 10;

/** Platform fee on a settled match, mirrored from STAKE_FEE_BPS. */
const FEE_RATE = 0.05;

const BLURBS: Partial<Record<GameType, string>> = {
  [GameType.NavalBattle]: '1v1 naval strategy - about 6 min',
  [GameType.TripleCut]: '1v1 - best of five',
};

/** Only the arenas with a web board: the rest have nothing to play them in. */
export function CreateRoomModal({ onClose, onCreated }: Props) {
  const { balances, enabled: potEnabled, refresh } = usePotStore();

  const [gameType, setGameType] = useState<GameType>(WEB_PLAYABLE_GAMES[0]!);
  const [gamePickerOpen, setGamePickerOpen] = useState(false);
  /** Null means free play. */
  const [stakeToken, setStakeToken] = useState<StakeAsset | null>(null);
  const [stakeAmount, setStakeAmount] = useState<number>(DEFAULT_STAKE);
  const [tokenPickerOpen, setTokenPickerOpen] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stakes come out of the pot, so a stale snapshot would offer a stake the
  // player can no longer cover.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const staked = stakeToken !== null;
  const stakeBase = staked
    ? parseStakeAmount(String(stakeAmount), stakeToken)
    : null;
  const available = staked ? (balances.available[stakeToken] ?? '0') : '0';
  const exceedsPot = stakeBase !== null && BigInt(available) < BigInt(stakeBase);
  const winnerTakes = stakeAmount * 2 * (1 - FEE_RATE);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const room = await apiClient.createGameRoom(
        gameType,
        stakeBase && stakeToken !== null
          ? { token: stakeToken, amount: stakeBase }
          : undefined,
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
    <Sheet
      open
      onOpenChange={next => !next && onClose()}
      title="Create game room"
      subtitle="Set the game and stake, then invite an opponent."
      footer={
        <button
          type="button"
          className="btn btn-lime btn-block btn-lg"
          onClick={create}
          disabled={busy || exceedsPot}
        >
          {busy ? (
            <span className="spinner" />
          ) : staked ? (
            `Create room · ${stakeAmount} ${STAKE_ASSET_SYMBOLS[stakeToken]}`
          ) : (
            'Create room'
          )}
        </button>
      }
    >
      <Field label="Game">
        <button
          type="button"
          className="picker-row"
          onClick={() => setGamePickerOpen(open => !open)}
        >
          <GameIcon gameType={gameType} size={34} />
          <span className="picker-text">
            <span className="picker-name">{GAME_LABELS[gameType]}</span>
            <span className="picker-blurb">{BLURBS[gameType]}</span>
          </span>
          <CaretDown size={16} color="var(--text-3)" />
        </button>
        {gamePickerOpen && (
          <div className="picker-list">
            {WEB_PLAYABLE_GAMES.map(option => (
              <button
                key={option}
                type="button"
                className={
                  option === gameType ? 'picker-item is-active' : 'picker-item'
                }
                onClick={() => {
                  setGameType(option);
                  setGamePickerOpen(false);
                }}
              >
                <GameIcon gameType={option} size={28} />
                <span className="picker-name">{GAME_LABELS[option]}</span>
                {option === gameType && <Check size={16} color="var(--lime)" />}
              </button>
            ))}
          </div>
        )}
      </Field>

      <div className="stake-head">
        <span className="card-label">STAKE</span>
        <Segmented
          value={staked ? 'staked' : 'free'}
          onChange={mode =>
            setStakeToken(mode === 'free' ? null : (stakeToken ?? StakeAsset.Usdc))
          }
          options={[
            { value: 'staked', label: 'Staked' },
            { value: 'free', label: 'Free play' },
          ]}
        />
      </div>

      {staked ? (
        <>
          <div className="stake-card">
            <div className="stake-card-head">
              <span className="card-label">AMOUNT</span>
              <span className="muted">
                Pot{' '}
                <span style={{ color: 'var(--gold)', fontWeight: 700 }}>
                  {formatStakeAmount(available, stakeToken)}
                </span>{' '}
                {STAKE_ASSET_SYMBOLS[stakeToken]}
              </span>
            </div>

            <div className="stake-amount-row">
              <span className="stake-amount">{stakeAmount}</span>
              <button
                type="button"
                className="token-pill"
                onClick={() => setTokenPickerOpen(open => !open)}
              >
                {STAKE_ASSET_SYMBOLS[stakeToken]}
                <CaretDown size={14} color="var(--text-3)" />
              </button>
            </div>

            {tokenPickerOpen ? (
              <div className="picker-list">
                {STAKEABLE_ASSETS.map(token => (
                  <button
                    key={token}
                    type="button"
                    className={
                      token === stakeToken ? 'picker-item is-active' : 'picker-item'
                    }
                    onClick={() => {
                      setStakeToken(token);
                      setTokenPickerOpen(false);
                    }}
                  >
                    <span className="picker-name">
                      {STAKE_ASSET_SYMBOLS[token]}
                    </span>
                    <span className="muted" style={{ marginLeft: 'auto' }}>
                      {formatStakeAmount(balances.available[token] ?? '0', token)}
                    </span>
                    {token === stakeToken && <Check size={16} color="var(--lime)" />}
                  </button>
                ))}
              </div>
            ) : (
              <div className="preset-row">
                {STAKE_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    className={
                      preset === stakeAmount ? 'preset is-active' : 'preset'
                    }
                    onClick={() => setStakeAmount(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="winner-row">
            <span className="muted">Winner takes</span>
            <span>
              <span style={{ fontWeight: 700, color: 'var(--gold)' }}>
                {winnerTakes} {STAKE_ASSET_SYMBOLS[stakeToken]}
              </span>
              <span className="muted"> · 5% fee</span>
            </span>
          </div>
        </>
      ) : (
        <p className="bs-hint">
          No stake - nothing wagered, just bragging rights.
        </p>
      )}

      <div className="private-card">
        <span className="tile" style={{ width: 36, height: 36 }}>
          <LockSimple size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="picker-name">Private room</div>
          <div className="picker-blurb">Hidden from the lobby · share a code</div>
        </div>
        <Switch
          checked={isPrivate}
          onCheckedChange={setIsPrivate}
          label="Private room"
        />
      </div>

      {!potEnabled && staked && (
        <div className="banner">Staking is switched off on this server.</div>
      )}
      {exceedsPot && stakeToken !== null && (
        <div className="banner">
          Your pot holds {formatStakeAmount(available, stakeToken)}{' '}
          {STAKE_ASSET_SYMBOLS[stakeToken]}. Staked games are paid from the pot,
          so add funds or lower the stake.
        </div>
      )}
      {error && <div className="banner">{error}</div>}
    </Sheet>
  );
}
