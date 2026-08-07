import { GameType } from '@gaming-platform/core';
import { Plus } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

import { GameIcon } from '../components/GameIcon';
import { GAME_LABELS, isWebPlayable } from '../lib/format';

const ARENAS: { gameType: GameType; blurb: string }[] = [
  { gameType: GameType.TripleCut, blurb: 'Duel - best of five, about 2 min' },
  { gameType: GameType.NavalBattle, blurb: 'Strategy - about 6 min' },
  { gameType: GameType.Salvo, blurb: 'Artillery - about 5 min' },
  { gameType: GameType.ChromaClash, blurb: 'Cards - about 4 min' },
  { gameType: GameType.Ludo, blurb: 'Board - about 9 min' },
];

export function GamesPage() {
  const navigate = useNavigate();

  return (
    <div className="page">
      <div>
        <h1 className="page-title">Games</h1>
        <p
          style={{
            margin: 'var(--s-4) 0 0',
            fontSize: 14,
            color: 'var(--text-2)',
            maxWidth: 520,
          }}
        >
          Five arenas today. Triple Cut plays right here in the browser; the
          rest are in the mobile app while their web clients are built.
        </p>
      </div>

      <div className="game-grid">
        {ARENAS.map(({ gameType, blurb }) => {
          const playable = isWebPlayable(gameType);
          return (
            <div key={gameType} className={playable ? 'game-card' : 'game-card is-locked'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
                <GameIcon gameType={gameType} size={64} />
                {playable ? (
                  <span
                    className="tag-lime"
                  >
                    PLAYABLE HERE
                  </span>
                ) : (
                  <span className="tag-muted">MOBILE ONLY</span>
                )}
              </div>
              <div
                style={{
                  marginTop: 'auto',
                  fontWeight: 700,
                  fontSize: 21,
                  letterSpacing: '-0.02em',
                }}
              >
                {GAME_LABELS[gameType]}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{blurb}</div>

              {playable && (
                <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
                  <button
                    type="button"
                    className="btn btn-lime btn-block"
                    onClick={() => navigate('/lobby')}
                  >
                    Find a room
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-lime btn-block"
                    onClick={() => navigate(`/demo/${gameType}`)}
                  >
                    Practice
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <div className="game-card is-locked">
          <span
            style={{
              width: 52,
              height: 52,
              borderRadius: 'var(--r-lg)',
              boxShadow: 'inset 0 0 0 1px var(--lime-edge)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Plus size={23} weight="bold" color="var(--lime)" />
          </span>
          <div
            style={{
              marginTop: 'auto',
              fontWeight: 700,
              fontSize: 19,
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
            }}
          >
            More arenas
            <br />
            in the works
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)' }}>
            A new game every few weeks. Testers vote on what gets built next.
          </p>
        </div>
      </div>
    </div>
  );
}
