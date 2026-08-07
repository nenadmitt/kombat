import { ArrowLeft } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { RpsBoard } from '../games/rps/RpsBoard';
import { useDemoRps } from '../games/rps/useDemoRps';

export function DemoRpsPage() {
  const navigate = useNavigate();
  // Remounting is the reset: the engine holds the whole match in local state.
  const [attempt, setAttempt] = useState(0);

  return (
    <div className="page">
      <div className="match-topline">
        <button
          type="button"
          className="btn btn-surface"
          onClick={() => navigate('/lobby')}
        >
          <ArrowLeft size={16} />
          Back to lobby
        </button>
        <h1 className="page-title" style={{ fontSize: 20 }}>
          Triple Cut - practice
        </h1>
        <button
          type="button"
          className="btn btn-surface"
          onClick={() => setAttempt(n => n + 1)}
        >
          New match
        </button>
      </div>

      <DemoBoard key={attempt} onRestart={() => setAttempt(n => n + 1)} />
    </div>
  );
}

function DemoBoard({ onRestart }: { onRestart: () => void }) {
  const navigate = useNavigate();
  const engine = useDemoRps();
  return (
    <RpsBoard
      {...engine.playProps}
      onBack={() => navigate('/lobby')}
      onPlayAgain={onRestart}
    />
  );
}
