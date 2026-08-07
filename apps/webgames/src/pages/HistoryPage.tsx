import {
  emptyPlayerStats,
  formatStakeAmount,
  STAKE_ASSET_SYMBOLS,
  winRate,
  type MatchHistoryEntry,
  type PlayerStats,
} from '@gaming-platform/core';
import { ArrowClockwise } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';

import { GameIcon } from '../components/GameIcon';
import {
  AchievementsCard,
  InviteCard,
  NetEarnings,
  ProfileCard,
} from '../components/ProfileCards';
import { apiClient } from '../lib/api';
import { GAME_LABELS } from '../lib/format';
import { useSessionStore } from '../store/session.store';

const PAGE_SIZE = 20;

type Tab = 'all' | 'win' | 'loss';

export function HistoryPage() {
  const user = useSessionStore(s => s.user);
  const [entries, setEntries] = useState<MatchHistoryEntry[]>([]);
  const [stats, setStats] = useState<PlayerStats>(emptyPlayerStats);
  const [tab, setTab] = useState<Tab>('all');
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    try {
      const page = await apiClient.getMatchHistory({ limit: PAGE_SIZE, offset });
      setEntries(prev => (offset === 0 ? page : [...prev, ...page]));
      setExhausted(page.length < PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(0);
    apiClient.getMyStats().then(setStats).catch(() => undefined);
  }, [load]);

  const shown = entries.filter(entry => tab === 'all' || entry.result === tab);

  return (
    <div className="page">
      <h1 className="page-title">History</h1>

      <div className="page-split">
        <div
          style={{
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--s-5)',
          }}
        >
          <NetEarnings stats={stats} />

          <div style={{ height: 1, background: 'var(--hairline-strong)' }} />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              maxWidth: 520,
            }}
          >
            <Stat value={String(stats.games)} label="PLAYED" />
            <Stat value={String(stats.wins)} label="WON" color="var(--win)" />
            <Stat value={String(stats.losses)} label="LOST" color="var(--loss)" />
            <Stat
              value={`${winRate(stats)}%`}
              label="WIN RATE"
              color="var(--lime)"
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--s-4)',
            }}
          >
            <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
              {(
                [
                  ['all', 'All games'],
                  ['win', 'Wins'],
                  ['loss', 'Losses'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={tab === value ? 'pill is-active' : 'pill'}
                  onClick={() => setTab(value)}
                >
                  {label}
                </button>
              ))}
            </div>
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
            <div className="row-head history-grid">
              <span>GAME</span>
              <span>OPPONENT</span>
              <span>STAKE</span>
              <span>RESULT</span>
              <span style={{ textAlign: 'right' }}>PAYOUT</span>
            </div>

            {shown.map(entry => (
              <HistoryRow key={entry.roomId} entry={entry} />
            ))}

            {loading && (
              <div className="empty">
                <span className="spinner" />
              </div>
            )}
            {!loading && shown.length === 0 && (
              <div className="empty">No matches yet. Go win one.</div>
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
          {user && <ProfileCard user={user} stats={stats} />}
          <AchievementsCard stats={stats} />
          {user && <InviteCard user={user} stats={stats} />}
        </aside>
      </div>
    </div>
  );
}

function HistoryRow({ entry }: { entry: MatchHistoryEntry }) {
  const won = entry.result === 'win';
  const voided = entry.result === 'void';
  const color = voided ? 'var(--text-3)' : won ? 'var(--win)' : 'var(--loss)';
  const opponents = entry.opponentUsernames.length
    ? entry.opponentUsernames.join(', ')
    : (entry.opponentUsername ?? 'Unknown');

  return (
    <div className="row row-hover history-grid">
      <span className="row-name">
        <GameIcon gameType={entry.gameType} size={32} />
        {GAME_LABELS[entry.gameType as keyof typeof GAME_LABELS] ?? 'Match'}
      </span>
      <span className="muted">{opponents}</span>
      <span className="muted">
        {entry.stakeToken === null || entry.stakeAmount === null
          ? 'Free'
          : formatStakeAmount(entry.stakeAmount, entry.stakeToken)}
      </span>
      <span
        style={{
          fontWeight: 700,
          fontSize: 10,
          letterSpacing: '0.09em',
          color,
        }}
      >
        {entry.result.toUpperCase()}
      </span>
      <span className="mono" style={{ textAlign: 'right', fontSize: 13, color }}>
        {entry.prizeDelta && entry.stakeToken !== null
          ? `${BigInt(entry.prizeDelta) >= 0n ? '+' : ''}${formatStakeAmount(
              entry.prizeDelta,
              entry.stakeToken,
            )} ${STAKE_ASSET_SYMBOLS[entry.stakeToken]}`
          : '-'}
      </span>
    </div>
  );
}

function Stat({
  value,
  label,
  color = 'var(--text)',
}: {
  value: string;
  label: string;
  color?: string;
}) {
  return (
    <div>
      <div className="stat-value" style={{ color }}>
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
