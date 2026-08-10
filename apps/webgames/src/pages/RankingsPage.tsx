import {
  MULTIPLAYER_GAME_TYPES,
  RANKING_POINTS_FREE_GAME,
  RANKING_POINTS_STAKED_GAME,
  type GameType,
  type RankingEntry,
} from '@gaming-platform/core';
import { ArrowClockwise, Medal, SquaresFour } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';

import { Dropdown } from '../components/Dropdown';
import { GameIcon } from '../components/GameIcon';
import { apiClient } from '../lib/api';
import { GAME_LABELS, initialOf } from '../lib/format';
import { useSessionStore } from '../store/session.store';

const PAGE_SIZE = 50;

const FILTERS: { value: GameType | 'all'; label: string }[] = [
  { value: 'all', label: 'All games' },
  ...MULTIPLAYER_GAME_TYPES.map(gameType => ({
    value: gameType,
    label: GAME_LABELS[gameType],
  })),
];

export function RankingsPage() {
  const userId = useSessionStore(s => s.user?.id);
  const [filter, setFilter] = useState<GameType | 'all'>('all');
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      try {
        const page = await apiClient.getRankings({
          gameType: filter === 'all' ? undefined : filter,
          limit: PAGE_SIZE,
          offset,
        });
        setEntries(prev => (offset === 0 ? page : [...prev, ...page]));
        setExhausted(page.length < PAGE_SIZE);
      } finally {
        setLoading(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    setEntries([]);
    void load(0);
  }, [load]);

  return (
    <div className="page">
      <h1 className="page-title">Rankings</h1>

      <div className="page-split">
        <div
          style={{
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s-5)',
          }}
        >
          <div className="toolbar">
            <Dropdown
              options={FILTERS.map(({ value, label }) => ({
                value,
                label,
                icon:
                  value === 'all' ? (
                    <SquaresFour size={18} color="var(--text-3)" />
                  ) : (
                    <GameIcon gameType={value} size={18} />
                  ),
              }))}
              value={filter}
              onChange={setFilter}
            />
            <button
              type="button"
              className="pill"
              onClick={() => void load(0)}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}
            >
              <ArrowClockwise size={12} weight="bold" />
              REFRESH
            </button>
          </div>

          <div className="rows">
            <div className="row-head rankings-grid">
              <span>#</span>
              <span>PLAYER</span>
              <span>GAMES</span>
              <span>WINS</span>
              <span style={{ textAlign: 'right' }}>COIN PTS</span>
              <span style={{ textAlign: 'right' }}>POINTS</span>
            </div>

            {entries.map(entry => (
              <RankingRow
                key={entry.userId}
                entry={entry}
                isSelf={entry.userId === userId}
              />
            ))}

            {loading && (
              <div className="empty">
                <span className="spinner" />
              </div>
            )}
            {!loading && entries.length === 0 && (
              <div className="empty">No ranked players yet. Go play.</div>
            )}
          </div>

          {!exhausted && !loading && (
            <button
              type="button"
              className="btn btn-surface"
              onClick={() => void load(entries.length)}
            >
              Load more
            </button>
          )}
        </div>

        <aside
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}
        >
          <div className="card">
            <div className="card-label">HOW POINTS WORK</div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--s-3)',
                marginTop: 'var(--s-4)',
              }}
            >
              <PointsRule
                label="Free game played"
                value={`+${RANKING_POINTS_FREE_GAME}`}
              />
              <PointsRule
                label="Staked game played"
                value={`+${RANKING_POINTS_STAKED_GAME}`}
              />
              <PointsRule label="1 stablecoin won" value="+1" />
              <PointsRule label="1 KOMBAT won" value="+0.1" />
            </div>
            <p
              className="muted"
              style={{ marginTop: 'var(--s-4)', lineHeight: 1.5 }}
            >
              Winnings count net of your own stake. Voided matches award
              nothing.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function RankingRow({
  entry,
  isSelf,
}: {
  entry: RankingEntry;
  isSelf: boolean;
}) {
  const name =
    entry.username ?? entry.ensName ?? `${entry.userId.slice(0, 8)}…`;
  const medalColor =
    entry.rank === 1
      ? 'var(--gold)'
      : entry.rank === 2
        ? 'var(--silver)'
        : entry.rank === 3
          ? 'var(--bronze)'
          : null;

  return (
    <div
      className={
        isSelf ? 'row rankings-grid is-self' : 'row row-hover rankings-grid'
      }
    >
      <span
        className="mono"
        style={{
          fontSize: 13,
          color: 'var(--text-3)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {medalColor ? (
          <Medal size={18} weight="fill" color={medalColor} />
        ) : (
          entry.rank
        )}
      </span>
      <span className="row-name">
        <span
          className="avatar"
          style={{ width: 32, height: 32, fontSize: 13 }}
        >
          {initialOf(name)}
        </span>
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </span>
        {isSelf && <span className="muted">you</span>}
      </span>
      <span className="muted">{entry.games}</span>
      <span className="muted">{entry.wins}</span>
      <span className="muted" style={{ textAlign: 'right' }}>
        {entry.coinPoints.toLocaleString()}
      </span>
      <span
        className="mono"
        style={{ textAlign: 'right', fontSize: 13, color: 'var(--lime)' }}
      >
        {entry.totalPoints.toLocaleString()}
      </span>
    </div>
  );
}

function PointsRule({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 'var(--s-3)',
      }}
    >
      <span className="muted">{label}</span>
      <span className="mono" style={{ fontSize: 13, color: 'var(--lime)' }}>
        {value}
      </span>
    </div>
  );
}
