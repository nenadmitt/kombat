import type { GameRoomSummary } from '@gaming-platform/core';
import { useState } from 'react';

import { GAME_LABELS } from '../lib/format';
import { useActiveRoomStore } from '../store/active-room.store';
import { GameIcon } from './GameIcon';

type Props = {
  room: GameRoomSummary;
  onRejoin: () => void;
  onDismiss: () => void;
};

type Face = 'resume' | 'confirm-forfeit';

export function ResumeMatchModal({ room, onRejoin, onDismiss }: Props) {
  const forfeit = useActiveRoomStore(s => s.forfeit);
  const forfeiting = useActiveRoomStore(s => s.forfeiting);
  const [face, setFace] = useState<Face>('resume');

  return (
    <div className="modal-backdrop">
      <div className="modal resume">
        {face === 'resume' ? (
          <>
            <div className="resume-icon">
              <GameIcon gameType={room.gameType} size={48} />
            </div>

            <span className="card-label">
              {GAME_LABELS[room.gameType].toUpperCase()}
            </span>
            <h2 className="modal-title">Match in progress</h2>
            <p className="resume-copy">
              Rejoin to keep playing, or forfeit to give the win to your
              opponent.
            </p>

            {room.code && (
              <div className="code-box">
                <span className="code-value">{room.code}</span>
              </div>
            )}

            <button
              type="button"
              className="btn btn-lime btn-block btn-lg"
              onClick={onRejoin}
              disabled={forfeiting}
            >
              Rejoin match
            </button>
            <button
              type="button"
              className="btn btn-surface btn-block"
              onClick={() => setFace('confirm-forfeit')}
              disabled={forfeiting}
            >
              Forfeit
            </button>
            <button type="button" className="pill" onClick={onDismiss}>
              Not now
            </button>
          </>
        ) : (
          <>
            <h2 className="modal-title">Forfeit match?</h2>
            <p className="resume-copy">
              You will lose this match and it cannot be resumed.
            </p>

            <button
              type="button"
              className="btn btn-danger btn-block btn-lg"
              onClick={() => void forfeit()}
              disabled={forfeiting}
            >
              {forfeiting ? <span className="spinner" /> : 'Forfeit'}
            </button>
            <button
              type="button"
              className="btn btn-surface btn-block"
              onClick={() => setFace('resume')}
              disabled={forfeiting}
            >
              Keep playing
            </button>
          </>
        )}
      </div>
    </div>
  );
}
