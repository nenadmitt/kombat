import { ArrowLeft, Flag } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { SalvoPlay } from '../games/salvo/SalvoPlay';
import type { SalvoEngine } from '../games/salvo/salvo-engine';
import { useDemoSalvo } from '../games/salvo/useDemoSalvo';
import { useMultiplayerSalvo } from '../games/salvo/useMultiplayerSalvo';
import { useResultExtras } from '../games/use-result-data';

export function SalvoMatchPage({ roomId }: { roomId: string }) {
  const engine = useMultiplayerSalvo(roomId);
  return <SalvoFlow engine={engine} multiplayer roomId={roomId} />;
}

export function SalvoDemoPage() {
  const [attempt, setAttempt] = useState(0);
  return <DemoFlow key={attempt} onRestart={() => setAttempt(n => n + 1)} />;
}

function DemoFlow({ onRestart }: { onRestart: () => void }) {
  const engine = useDemoSalvo();
  return <SalvoFlow engine={engine} multiplayer={false} onRestart={onRestart} />;
}

function SalvoFlow({
  engine,
  multiplayer,
  onRestart,
  roomId = null,
}: {
  engine: SalvoEngine;
  multiplayer: boolean;
  onRestart?: () => void;
  roomId?: string | null;
}) {
  const navigate = useNavigate();
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const over = engine.playProps.result !== null;
  const foe = engine.playProps.seats.find(
    seat => seat.side !== engine.playProps.me,
  );
  const extras = useResultExtras(roomId, over, foe?.name ?? 'Your opponent');

  return (
    <div className="page">
      <div className="match-topline">
        <button
          type="button"
          className="btn btn-surface"
          onClick={() => navigate('/lobby')}
        >
          <ArrowLeft size={16} />
          {over || !multiplayer ? 'Back to lobby' : 'Leave board'}
        </button>

        <div className="match-topline-title">
          <h1 className="page-title" style={{ fontSize: 20 }}>
            Salvo{multiplayer ? '' : ' - practice'}
          </h1>
          {over && <span className="match-topline-sub">Match complete</span>}
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
            Forfeit
          </button>
        ) : (
          <span style={{ width: 110 }} />
        )}
      </div>

      {engine.phase === 'waiting' ? (
        <div className="arena">
          <div className="arena-body">
            <span className="spinner-ring" />
            <span className="card-label">TAKING THE FIELD</span>
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
        <SalvoPlay
          {...engine.playProps}
          {...extras}
          onBack={() => navigate('/lobby')}
          onPlayAgain={onRestart}
        />
      )}

      {confirmForfeit && (
        <div className="modal-backdrop" onClick={() => setConfirmForfeit(false)}>
          <div className="modal" onClick={event => event.stopPropagation()}>
            <h2 className="modal-title">Forfeit this match?</h2>
            <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 13 }}>
              Your opponent takes the win, and any stake with it.
            </p>
            <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
              <button
                type="button"
                className="btn btn-surface btn-block"
                onClick={() => setConfirmForfeit(false)}
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
                }}
              >
                Forfeit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
