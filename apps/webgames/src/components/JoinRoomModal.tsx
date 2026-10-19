import {
  convertStakeAmount,
  formatStakeAmount,
  isStableAsset,
  STABLE_ASSETS,
  STAKE_ASSET_SYMBOLS,
  StakeAsset,
  type GameRoomSummary,
} from '@gaming-platform/core';
import { CaretDown, Check } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { GameIcon } from './GameIcon';
import { TokenIcon } from './TokenIcon';
import { Sheet } from './ui';
import { GAME_LABELS } from '../lib/format';
import { usePotStore } from '../store/pot.store';

type Props = {
  room: GameRoomSummary;
  hostName: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  /** The token is omitted when it is the room's own, keeping the wire as-is. */
  onConfirm: (stakeToken?: StakeAsset) => void;
};

/** Platform fee on a settled match, mirrored from STAKE_FEE_BPS. */
const FEE_BPS = 500n;
const BPS = 10_000n;

export function JoinRoomModal({
  room,
  hostName,
  busy,
  error,
  onClose,
  onConfirm,
}: Props) {
  const { balances, enabled: potEnabled, loaded, refresh } = usePotStore();
  const roomToken = room.stakeToken;
  const [token, setToken] = useState<StakeAsset>(roomToken ?? StakeAsset.Usdc);
  const [pickerOpen, setPickerOpen] = useState(false);

  // The entry leaves the pot, so a stale snapshot could offer a token the player can't cover.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (roomToken === null || room.stakeAmount === null) {
    return (
      <FreeJoinSheet
        room={room}
        hostName={hostName}
        busy={busy}
        error={error}
        onClose={onClose}
        onConfirm={() => onConfirm()}
      />
    );
  }

  const swappable = isStableAsset(roomToken);
  const amountIn = (asset: StakeAsset) =>
    convertStakeAmount(room.stakeAmount!, roomToken, asset);
  const stakeBase = amountIn(token);
  const available = balances.available[token] ?? '0';
  const shortOnPot = loaded && BigInt(available) < BigInt(stakeBase);
  const entry = formatStakeAmount(stakeBase, token);

  // A multi-seat room can start early, so only a table this join fills has a knowable pot.
  const seatsTaken = room.joinedCount + 1;
  const seatsLeft = room.playerCount - seatsTaken;
  const pot = BigInt(stakeBase) * BigInt(seatsTaken);
  const winnerTakes = formatStakeAmount(
    (pot - (pot * FEE_BPS) / BPS).toString(),
    token,
  );

  return (
    <Sheet
      open
      onOpenChange={next => !next && onClose()}
      title="Join this room"
      subtitle="Your entry leaves the pot the moment the match starts."
      footer={
        <button
          type="button"
          className="btn btn-lime btn-block btn-lg"
          onClick={() => onConfirm(token === roomToken ? undefined : token)}
          disabled={busy || !loaded || shortOnPot}
        >
          {busy ? (
            <span className="spinner" />
          ) : (
            `Stake ${entry} ${STAKE_ASSET_SYMBOLS[token]}`
          )}
        </button>
      }
    >
      <div className="picker-row">
        <GameIcon gameType={room.gameType} size={34} />
        <span className="picker-text">
          <span className="picker-name">{GAME_LABELS[room.gameType]}</span>
          <span className="picker-blurb">
            Hosted by {hostName} · {room.joinedCount} / {room.playerCount}{' '}
            seated
          </span>
        </span>
      </div>

      <div className="stake-card">
        <div className="stake-card-head">
          <span className="card-label">ENTRY</span>
          <span className="muted">
            Pot{' '}
            <span style={{ color: 'var(--gold)', fontWeight: 700 }}>
              {formatStakeAmount(available, token)}
            </span>{' '}
            {STAKE_ASSET_SYMBOLS[token]}
          </span>
        </div>

        <div className="stake-amount-row">
          <span className="stake-amount">{entry}</span>
          {swappable ? (
            <button
              type="button"
              className="token-pill"
              onClick={() => setPickerOpen(open => !open)}
            >
              <TokenIcon symbol={STAKE_ASSET_SYMBOLS[token]} size={18} />
              {STAKE_ASSET_SYMBOLS[token]}
              <CaretDown size={14} color="var(--text-3)" />
            </button>
          ) : (
            <span className="token-pill">
              <TokenIcon symbol={STAKE_ASSET_SYMBOLS[token]} size={18} />
              {STAKE_ASSET_SYMBOLS[token]}
            </span>
          )}
        </div>

        {swappable && pickerOpen && (
          <div className="picker-list">
            {STABLE_ASSETS.map(option => {
              const short =
                loaded &&
                BigInt(balances.available[option] ?? '0') <
                  BigInt(amountIn(option));
              return (
                <button
                  key={option}
                  type="button"
                  className={
                    option === token ? 'picker-item is-active' : 'picker-item'
                  }
                  onClick={() => {
                    setToken(option);
                    setPickerOpen(false);
                  }}
                  disabled={short}
                >
                  <TokenIcon symbol={STAKE_ASSET_SYMBOLS[option]} size={20} />
                  <span className="picker-name">
                    {STAKE_ASSET_SYMBOLS[option]}
                  </span>
                  <span className="muted" style={{ marginLeft: 'auto' }}>
                    {formatStakeAmount(
                      balances.available[option] ?? '0',
                      option,
                    )}
                  </span>
                  {option === token && <Check size={16} color="var(--lime)" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {swappable && (
        <p className="bs-hint">
          This room is staked in {STAKE_ASSET_SYMBOLS[roomToken]}, and every
          stablecoin counts the same. Whatever you stake is what you get back.
        </p>
      )}

      <div className="winner-row">
        <span className="muted">
          {seatsLeft > 0 ? 'Winner takes at least' : 'Winner takes'}
        </span>
        <span>
          <span style={{ fontWeight: 700, color: 'var(--gold)' }}>
            {winnerTakes}{' '}
            {token === roomToken
              ? STAKE_ASSET_SYMBOLS[roomToken]
              : 'in stablecoins'}
          </span>
          <span className="muted"> · 5% fee</span>
        </span>
      </div>

      {!potEnabled && (
        <div className="banner">Staking is switched off on this server.</div>
      )}
      {shortOnPot && (
        <div className="banner">
          Your pot holds {formatStakeAmount(available, token)}{' '}
          {STAKE_ASSET_SYMBOLS[token]}. Add funds or pick a token you can cover.
        </div>
      )}
      {error && <div className="banner">{error}</div>}
    </Sheet>
  );
}

function FreeJoinSheet({
  room,
  hostName,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  room: GameRoomSummary;
  hostName: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const startsNow = room.joinedCount + 1 >= room.playerCount;
  return (
    <Sheet
      open
      onOpenChange={next => !next && onClose()}
      title="Join this room"
      subtitle={
        startsNow
          ? 'Your seat fills the table, so the match starts as soon as you join.'
          : 'You take a seat and wait for the host to start.'
      }
      footer={
        <button
          type="button"
          className="btn btn-lime btn-block btn-lg"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? (
            <span className="spinner" />
          ) : startsNow ? (
            'Join and play now'
          ) : (
            'Take a seat'
          )}
        </button>
      }
    >
      <div className="picker-row">
        <GameIcon gameType={room.gameType} size={34} />
        <span className="picker-text">
          <span className="picker-name">{GAME_LABELS[room.gameType]}</span>
          <span className="picker-blurb">
            Hosted by {hostName} · {room.joinedCount} / {room.playerCount}{' '}
            seated · Free
          </span>
        </span>
      </div>
      {error && <div className="banner">{error}</div>}
    </Sheet>
  );
}
