import {
  achievementsFor,
  emptyPlayerStats,
  formatStakeAmount,
  gamesToNextLevel,
  levelForGames,
  STAKE_ASSET_SYMBOLS,
  winRate,
  type PlayerStats,
  type StakeAsset,
} from '@gaming-platform/core';
import {
  Copy,
  Crown,
  Flame,
  LockSimple,
  SignOut,
  Trophy,
  UsersThree,
  type Icon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';

import { GameIcon } from '../components/GameIcon';
import { apiClient } from '../lib/api';
import { GAME_LABELS, initialOf, shortAddress } from '../lib/format';
import { sessionStorage } from '../lib/session-storage';
import { useSessionStore } from '../store/session.store';

const BADGE_ICONS: Icon[] = [Trophy, Crown, Flame, Trophy];

export function ProfilePage() {
  const user = useSessionStore(s => s.user);
  const signOut = useSessionStore(s => s.signOut);
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const [stats, setStats] = useState<PlayerStats>(emptyPlayerStats);
  const [copied, setCopied] = useState<'code' | 'address' | null>(null);

  useEffect(() => {
    apiClient.getMyStats().then(setStats).catch(() => undefined);
  }, []);

  if (!user) return null;

  const color = sessionStorage.readColor() ?? 'var(--lime)';
  const level = levelForGames(stats.games);
  const toNext = gamesToNextLevel(stats.games);
  const joined = stats.joinedAt
    ? new Date(stats.joinedAt).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      })
    : null;
  const badges = achievementsFor(stats);
  const unlocked = badges.filter(badge => badge.unlocked).length;
  const earnings = Object.entries(stats.netByToken) as [string, string][];

  async function copy(what: 'code' | 'address', value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="page">
      <div className="profile-hero">
        <span
          className="avatar profile-avatar"
          style={{ background: color }}
        >
          {initialOf(user.username)}
        </span>
        <div className="profile-identity">
          <h1 className="page-title">{user.username ?? 'Unnamed'}</h1>
          {user.ensName && <div className="profile-ens">{user.ensName}</div>}
          <div className="profile-meta">
            <span className="chip-level">LEVEL {level}</span>
            <span className="muted">
              {toNext} more {toNext === 1 ? 'match' : 'matches'} to level{' '}
              {level + 1}
            </span>
            {joined && <span className="muted">· Joined {joined}</span>}
          </div>
        </div>
      </div>

      <div className="page-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
          <div className="card">
            <span className="card-label">LIFETIME RECORD</span>
            <div className="profile-stats stat-row">
              <Stat value={String(stats.games)} label="PLAYED" />
              <Stat value={String(stats.wins)} label="WON" color="var(--win)" />
              <Stat value={String(stats.losses)} label="LOST" color="var(--loss)" />
              <Stat
                value={`${winRate(stats)}%`}
                label="WIN RATE"
                color="var(--lime)"
              />
              <Stat
                value={String(stats.bestStreak)}
                label="BEST STREAK"
                color="var(--lime)"
              />
            </div>
          </div>

          <div className="card">
            <span className="card-label">NET EARNED</span>
            {earnings.length === 0 ? (
              <p className="bs-hint" style={{ marginTop: 'var(--s-3)' }}>
                Nothing staked yet. Win a staked match and it shows up here.
              </p>
            ) : (
              <div className="rows" style={{ marginTop: 'var(--s-3)' }}>
                {earnings.map(([key, net]) => {
                  const asset = Number(key) as StakeAsset;
                  const positive = BigInt(net) >= 0n;
                  return (
                    <div
                      key={key}
                      className="row"
                      style={{ gridTemplateColumns: '1fr auto' }}
                    >
                      <span className="row-name">
                        {STAKE_ASSET_SYMBOLS[asset]}
                      </span>
                      <span
                        className="mono"
                        style={{ color: positive ? 'var(--win)' : 'var(--loss)' }}
                      >
                        {positive ? '+' : ''}
                        {formatStakeAmount(net, asset)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {stats.mostPlayed && (
            <div className="card profile-most-played">
              <GameIcon gameType={stats.mostPlayed.gameType} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="card-label">MOST PLAYED</span>
                <div className="picker-name" style={{ marginTop: 'var(--s-2)' }}>
                  {GAME_LABELS[stats.mostPlayed.gameType]}
                </div>
              </div>
              <span className="mono" style={{ color: 'var(--text-3)' }}>
                {stats.mostPlayed.matches}
              </span>
            </div>
          )}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div className="card">
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
              }}
            >
              <span className="card-label">ACHIEVEMENTS</span>
              <span className="muted">
                {unlocked} of {badges.length}
              </span>
            </div>
            <div className="badge-row">
              {badges.map((badge, index) => {
                const Glyph = badge.unlocked
                  ? (BADGE_ICONS[index] ?? Trophy)
                  : LockSimple;
                return (
                  <div
                    key={badge.id}
                    className={badge.unlocked ? 'badge' : 'badge is-locked'}
                    title={badge.unlocked ? badge.label : badge.requirement}
                  >
                    <span className="badge-ring">
                      <Glyph
                        size={20}
                        weight="bold"
                        color={badge.unlocked ? 'var(--ink)' : 'var(--text-3)'}
                      />
                    </span>
                    <span className="badge-name">{badge.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card-gold">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
              <UsersThree size={16} weight="fill" color="var(--gold)" />
              <span className="card-label-gold">INVITE AND EARN</span>
            </div>
            <p
              style={{
                margin: 'var(--s-3) 0 0',
                fontSize: 12,
                lineHeight: 1.5,
                color: 'var(--text-2)',
              }}
            >
              A slice of the fee from every match your invites play.
            </p>
            {user.referralCode ? (
              <button
                type="button"
                className="code-box"
                style={{ marginTop: 'var(--s-4)', width: '100%' }}
                onClick={() => copy('code', user.referralCode!)}
              >
                <span className="code-value" style={{ color: 'var(--gold)' }}>
                  {user.referralCode}
                </span>
                <Copy size={14} color="var(--text-3)" />
              </button>
            ) : (
              <p className="bs-hint">Pick a username to get your code.</p>
            )}
            {copied === 'code' && (
              <span className="card-label">COPIED TO CLIPBOARD</span>
            )}
            <div className="profile-stats" style={{ marginTop: 'var(--s-4)' }}>
              <Stat
                value={String(stats.referrals)}
                label="INVITED"
                color="var(--gold)"
              />
            </div>
          </div>

          <div className="card">
            <span className="card-label">SIGNED IN WITH</span>
            <button
              type="button"
              className="code-box"
              style={{ marginTop: 'var(--s-3)', width: '100%' }}
              onClick={() => address && copy('address', address)}
              disabled={!address}
            >
              <span
                className="mono"
                style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 13 }}
              >
                {address ? shortAddress(address) : 'Wallet disconnected'}
              </span>
              {address && <Copy size={14} color="var(--text-3)" />}
            </button>
            {copied === 'address' && (
              <span className="card-label">COPIED TO CLIPBOARD</span>
            )}
            <button
              type="button"
              className="btn btn-surface btn-block"
              style={{ marginTop: 'var(--s-4)' }}
              onClick={() => {
                disconnect();
                void signOut();
              }}
            >
              <SignOut size={16} />
              Sign out
            </button>
          </div>
        </aside>
      </div>
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
