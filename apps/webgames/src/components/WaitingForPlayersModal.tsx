import {
  formatStakeAmount,
  LUDO_MIN_PLAYERS,
  STAKE_ASSET_SYMBOLS,
  type GameRoomSummary,
} from '@gaming-platform/core';
import { CaretDown, Check, Copy, ShareNetwork } from '@phosphor-icons/react';
import { useState } from 'react';

import { GAME_LABELS } from '../lib/format';

type Props = {
  room: GameRoomSummary;
  cancelling: boolean;
  onMinimize: () => void;
  onCancel: () => void;
  /** Host-only, multi-seat rooms: start before every seat is taken. */
  onStartNow?: () => void;
  starting?: boolean;
  /** A guest sees the table fill; they can leave, not cancel or start it. */
  isGuest?: boolean;
};

/**
 * The creator's "waiting for players" surface, mirroring the mobile popup.
 * Minimizing leaves the room open and falls back to the lobby's own room
 * card, which is this modal's minimized form.
 */
export function WaitingForPlayersModal({
  room,
  cancelling,
  onMinimize,
  onCancel,
  onStartNow,
  starting = false,
  isGuest = false,
}: Props) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const code = room.code ?? '';
  const multiSeat = room.playerCount > 2;
  const seatsLeft = room.playerCount - room.joinedCount;
  const canStartNow =
    multiSeat && !isGuest && room.joinedCount >= LUDO_MIN_PLAYERS && seatsLeft > 0;

  async function copy(what: 'code' | 'link') {
    const text =
      what === 'code' ? code : `${window.location.origin}/lobby?join=${code}`;
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  }

  async function share() {
    const url = `${window.location.origin}/lobby?join=${code}`;
    const payload = {
      title: 'Kombat',
      text: `Join my Kombat match - room code ${code}`,
      url,
    };
    // The Web Share sheet is mobile/Safari only; copying is the fallback.
    if (navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch {
        // Sheet dismissed; fall through to the copy.
      }
    }
    await copy('link');
  }

  return (
    <div className="modal-backdrop" onClick={onMinimize}>
      <div className="modal" onClick={event => event.stopPropagation()}>
        <button
          type="button"
          className="modal-minimize"
          onClick={onMinimize}
          aria-label="Minimize"
        >
          <CaretDown size={18} />
        </button>

        <span className="spinner-ring" />

        <span className="card-label" style={{ textAlign: 'center' }}>
          {GAME_LABELS[room.gameType].toUpperCase()}
        </span>

        <h2 className="modal-title" style={{ textAlign: 'center' }}>
          {multiSeat
            ? `Waiting for players - ${room.joinedCount} of ${room.playerCount}`
            : 'Waiting for an opponent'}
        </h2>

        <p
          style={{
            margin: 0,
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--text-2)',
          }}
        >
          {multiSeat && canStartNow
            ? `${seatsLeft} ${seatsLeft === 1 ? 'seat is' : 'seats are'} still open. Start now and play with who is here.`
            : room.isPrivate
              ? 'Private room. Share the code so a friend can join.'
              : 'Anyone can join from the lobby, or with your room code.'}
          {room.stakeToken !== null && room.stakeAmount !== null && (
            <>
              {' '}
              Entry is{' '}
              <span style={{ color: 'var(--gold)', fontWeight: 700 }}>
                {formatStakeAmount(room.stakeAmount, room.stakeToken)}{' '}
                {STAKE_ASSET_SYMBOLS[room.stakeToken]}
              </span>
              .
            </>
          )}
        </p>

        {code && (
          <button type="button" className="code-box" onClick={() => copy('code')}>
            <span className="card-label">CODE</span>
            <span className="code-value">{code}</span>
            {copied === 'code' ? (
              <Check size={15} color="var(--win)" />
            ) : (
              <Copy size={15} color="var(--lime)" />
            )}
          </button>
        )}

        {canStartNow && (
          <button
            type="button"
            className="btn btn-lime btn-block btn-lg"
            onClick={onStartNow}
            disabled={starting}
          >
            {starting ? (
              <span className="spinner" />
            ) : (
              `Start with ${room.joinedCount} players`
            )}
          </button>
        )}

        <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
          <button
            type="button"
            className="btn btn-surface btn-block"
            onClick={share}
          >
            <ShareNetwork size={16} color="var(--lime)" />
            {copied === 'link' ? 'Link copied' : 'Share'}
          </button>
          <button
            type="button"
            className="btn btn-surface btn-block"
            onClick={onCancel}
            disabled={cancelling}
          >
            {cancelling ? (
              <span className="spinner" />
            ) : isGuest ? (
              'Leave room'
            ) : (
              'Cancel room'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
