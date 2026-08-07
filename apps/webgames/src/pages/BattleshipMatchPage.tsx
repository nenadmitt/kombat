import { ArrowLeft, Flag } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { BattleshipPlay } from '../games/battleship/BattleshipPlay';
import { BattleshipSetup } from '../games/battleship/BattleshipSetup';
import { Countdown } from '../games/battleship/Countdown';
import type { BattleshipEngine } from '../games/battleship/battleship-engine';
import { useDemoBattleship } from '../games/battleship/useDemoBattleship';
import { useMultiplayerBattleship } from '../games/battleship/useMultiplayerBattleship';

export function BattleshipMatchPage({ roomId }: { roomId: string }) {
  const engine = useMultiplayerBattleship(roomId);
  return <BattleshipFlow engine={engine} multiplayer />;
}

export function BattleshipDemoPage() {
  const [attempt, setAttempt] = useState(0);
  return <DemoFlow key={attempt} onRestart={() => setAttempt(n => n + 1)} />;
}

function DemoFlow({ onRestart }: { onRestart: () => void }) {
  const engine = useDemoBattleship();
  return <BattleshipFlow engine={engine} multiplayer={false} onRestart={onRestart} />;
}

function BattleshipFlow({
  engine,
  multiplayer,
  onRestart,
}: {
  engine: BattleshipEngine;
  multiplayer: boolean;
  onRestart?: () => void;
}) {
  const navigate = useNavigate();
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const over = engine.playProps.result !== null;

  return (
    <div className="page">
      <div className="bs-topline">
        <button
          type="button"
          className="btn btn-surface"
          onClick={() => navigate('/lobby')}
        >
          <ArrowLeft size={16} />
          {over || !multiplayer ? 'Back to lobby' : 'Leave board'}
        </button>

        <h1 className="page-title" style={{ fontSize: 20 }}>
          Battleships{multiplayer ? '' : ' - practice'}
        </h1>

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

      {engine.phase === 'setup' && (
        <BattleshipSetup onReady={engine.submitFleet} deadline={engine.setupDeadline} />
      )}

      {engine.phase === 'waiting' && (
        <div className="arena">
          <div className="arena-body">
            <span className="spinner-ring" />
            <span className="card-label">FLEET DEPLOYED</span>
            <h2 className="modal-title">Waiting for your opponent</h2>
            {engine.setupDeadline && (
              <Countdown deadline={engine.setupDeadline} label="UNTIL AUTO-FORFEIT" />
            )}
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
      )}

      {engine.phase === 'play' && <BattleshipPlay {...engine.playProps} />}

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
