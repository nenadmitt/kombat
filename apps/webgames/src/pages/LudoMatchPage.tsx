import { ArrowLeft, Flag } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { LudoPlay } from '../games/ludo/LudoPlay';
import type { LudoEngine } from '../games/ludo/ludo-engine';
import { useDemoLudo } from '../games/ludo/useDemoLudo';
import { useMultiplayerLudo } from '../games/ludo/useMultiplayerLudo';
import { useLeaveGuard } from '../games/use-leave-guard';
import { useResultExtras } from '../games/use-result-data';

export function LudoMatchPage({ roomId }: { roomId: string }) {
  const engine = useMultiplayerLudo(roomId);
  return <LudoFlow engine={engine} multiplayer roomId={roomId} />;
}

export function LudoDemoPage() {
  const [attempt, setAttempt] = useState(0);
  return <DemoFlow key={attempt} onRestart={() => setAttempt(n => n + 1)} />;
}

function DemoFlow({ onRestart }: { onRestart: () => void }) {
  const engine = useDemoLudo();
  return <LudoFlow engine={engine} multiplayer={false} onRestart={onRestart} />;
}

function LudoFlow({
  engine,
  multiplayer,
  onRestart,
  roomId = null,
}: {
  engine: LudoEngine;
  multiplayer: boolean;
  onRestart?: () => void;
  roomId?: string | null;
}) {
  const navigate = useNavigate();
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const over = engine.playProps.result !== null;

  // With three or four seats there is no single opponent, so the table size stands in.
  const extras = useResultExtras(
    roomId,
    over,
    engine.playProps.winnerName ?? 'the winner',
  );
  const leave = useLeaveGuard(!over);
  const leaving = leave.pending !== null;

  return (
    <div className="page">
      <div className="match-topline ludo-topline">
        <button
          type="button"
          className="btn btn-surface"
          onClick={() => leave.request(() => navigate('/lobby'))}
        >
          <ArrowLeft size={16} />
          <span className="ludo-top-label">
            {over || !multiplayer ? 'Back to lobby' : 'Leave board'}
          </span>
        </button>

        <div className="match-topline-title">
          <h1 className="page-title ludo-match-title">
            Ludo Royale{multiplayer ? '' : ' - practice'}
          </h1>
          <span className="match-topline-sub">
            {over
              ? 'Match complete'
              : `${engine.playProps.seats.length} players`}
          </span>
        </div>

        {onRestart && over ? (
          <button type="button" className="btn btn-surface" onClick={onRestart}>
            New match
          </button>
        ) : multiplayer && !over && engine.phase === 'play' ? (
          <button
            type="button"
            className="btn btn-surface"
            onClick={() => setConfirmForfeit(true)}
          >
            <Flag size={16} color="var(--loss)" />
            <span className="ludo-top-label">Forfeit</span>
          </button>
        ) : (
          <span className="ludo-top-spacer" />
        )}
      </div>

      {engine.phase === 'waiting' ? (
        <div className="arena">
          <div className="arena-body">
            <span className="spinner-ring" />
            <span className="card-label">TAKING YOUR SEAT</span>
            <h2 className="modal-title">Setting up the table</h2>
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
        <LudoPlay
          {...engine.playProps}
          {...extras}
          onBack={() => navigate('/lobby')}
          onPlayAgain={onRestart}
        />
      )}

      {(confirmForfeit || leaving) && (
        <div
          className="modal-backdrop"
          onClick={() => (leaving ? leave.cancel() : setConfirmForfeit(false))}
        >
          <div className="modal" onClick={event => event.stopPropagation()}>
            <h2 className="modal-title">Leave this match?</h2>
            <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>
              {multiplayer
                ? 'Your pawns go back to base and you are out of the race. The rest of the table plays on for the pot.'
                : 'The practice match is discarded.'}
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
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
