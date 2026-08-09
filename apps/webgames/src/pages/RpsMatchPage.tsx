import { ArrowLeft, Flag } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { RpsBoard } from '../games/rps/RpsBoard';
import { useMultiplayerRps } from '../games/rps/useMultiplayerRps';
import { useLeaveGuard } from '../games/use-leave-guard';
import { useResultExtras } from '../games/use-result-data';

export function RpsMatchPage({ roomId }: { roomId: string }) {
  const navigate = useNavigate();
  const engine = useMultiplayerRps(roomId);
  const [confirmForfeit, setConfirmForfeit] = useState(false);

  const over = engine.playProps.result !== null;
  const extras = useResultExtras(roomId, over, engine.playProps.opponent.name);
  const leave = useLeaveGuard(!over);
  const leaving = leave.pending !== null;

  return (
    <div className="page">
      <div className="match-topline">
        <button
          type="button"
          className="btn btn-surface"
          onClick={() => leave.request(() => navigate('/lobby'))}
        >
          <ArrowLeft size={16} />
          {over ? 'Back to lobby' : 'Leave board'}
        </button>

        <div className="match-topline-title">
          <h1 className="page-title" style={{ fontSize: 20 }}>
            Triple Cut
          </h1>
          {over && <span className="match-topline-sub">Match complete</span>}
        </div>

        {!over && engine.phase === 'play' ? (
          <button
            type="button"
            className="btn btn-surface"
            onClick={() => setConfirmForfeit(true)}
          >
            <Flag size={16} color="var(--loss)" />
            Forfeit
          </button>
        ) : (
          <span style={{ width: 110 }} />
        )}
      </div>

      {engine.phase === 'waiting' ? (
        <div className="arena">
          <div className="arena-body">
            <span className="spinner" />
            <div className="card-label">WAITING FOR THE MATCH</div>
            {engine.waitingError && (
              <div className="banner">{engine.waitingError}</div>
            )}
            <button
              type="button"
              className="btn btn-surface"
              onClick={() => navigate('/lobby')}
            >
              Back to lobby
            </button>
          </div>
        </div>
      ) : (
        <RpsBoard
          {...engine.playProps}
          {...extras}
          onBack={() => navigate('/lobby')}
        />
      )}

      {(confirmForfeit || leaving) && (
        <div
          className="modal-backdrop"
          onClick={() => (leaving ? leave.cancel() : setConfirmForfeit(false))}
        >
          <div className="modal" onClick={event => event.stopPropagation()}>
            <h2 className="modal-title">
              {leaving ? 'Leave this match?' : 'Forfeit this match?'}
            </h2>
            <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>
              {leaving ? 'Leaving forfeits the match. ' : ''}Your opponent takes
              the win, and any stake with it.
            </p>
            <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
              <button
                type="button"
                className="btn btn-surface btn-block"
                onClick={() => (leaving ? leave.cancel() : setConfirmForfeit(false))}
              >
                Keep playing
              </button>
              <button
                type="button"
                className="btn btn-block"
                style={{ background: 'var(--loss)', color: 'var(--ink)' }}
                onClick={() => {
                  engine.forfeit();
                  setConfirmForfeit(false);
                  leave.resolve();
                }}
              >
                {leaving ? 'Leave' : 'Forfeit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
