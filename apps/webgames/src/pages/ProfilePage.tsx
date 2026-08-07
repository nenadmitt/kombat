import {
  achievementsFor,
  emptyPlayerStats,
  formatStakeAmount,
  STAKE_ASSET_SYMBOLS,
  winRate,
  type Achievement,
  type PlayerStats,
  type StakeAsset,
} from '@gaming-platform/core';
import {
  Copy,
  Crown,
  Flame,
  GlobeHemisphereWest,
  GlobeSimple,
  LockSimple,
  ShareNetwork,
  SignOut,
  Trophy,
  User,
  UsersThree,
  Wallet,
  type Icon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';

import { GameIcon } from '../components/GameIcon';
import { apiClient } from '../lib/api';
import { CHAIN_NAME } from '../lib/chain';
import { GAME_LABELS, initialOf, shortAddress } from '../lib/format';
import { sessionStorage } from '../lib/session-storage';
import { useSessionStore } from '../store/session.store';

const BADGE_ICONS: Record<string, Icon> = {
  'first-blood': Flame,
  'top-gun': Trophy,
  veteran: Crown,
  whale: Crown,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function ProfilePage() {
  const user = useSessionStore(s => s.user);
  const signOut = useSessionStore(s => s.signOut);
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const [stats, setStats] = useState<PlayerStats>(emptyPlayerStats);
  const [copied, setCopied] = useState<'code' | 'address' | 'ens' | null>(null);

  useEffect(() => {
    apiClient.getMyStats().then(setStats).catch(() => undefined);
  }, []);

  if (!user) return null;

  const color = sessionStorage.readColor() ?? 'var(--lime)';
  const joinedDays = stats.joinedAt
    ? Math.max(0, Math.floor((Date.now() - Date.parse(stats.joinedAt)) / DAY_MS))
    : null;
  const badges = achievementsFor(stats);
  const unlocked = badges.filter(badge => badge.unlocked).length;
  const earnings = Object.entries(stats.netByToken) as [string, string][];

  async function copy(what: 'code' | 'address' | 'ens', value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="page">
      <div className="profile-hero">
        <span className="avatar profile-avatar" style={{ background: color }}>
          {initialOf(user.username)}
        </span>
        <div className="profile-identity">
          <h1 className="page-title">{user.username ?? 'Unnamed'}</h1>
          <div className="profile-chips">
            {user.ensName && (
              <button
                type="button"
                className="profile-chip is-ens"
                onClick={() => copy('ens', user.ensName!)}
              >
                <GlobeSimple size={13} weight="fill" color="var(--lime)" />
                {user.ensName}
                <Copy size={13} color="var(--text-3)" />
              </button>
            )}
            {address && (
              <button
                type="button"
                className="profile-chip is-address"
                onClick={() => copy('address', address)}
              >
                {shortAddress(address)}
                <Copy size={13} color="var(--text-3)" />
              </button>
            )}
            {copied && <span className="card-label">COPIED</span>}
          </div>
        </div>
      </div>

      <div className="page-split">
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-6)' }}
        >
          <div className="hairline-fade" />

          <div className="stat-row" style={{ maxWidth: 600 }}>
            <Stat
              value={String(stats.bestStreak)}
              label="BEST STREAK"
              color="var(--lime)"
            />
            <Stat value={String(stats.games)} label="MATCHES" />
            <Stat value={`${winRate(stats)}%`} label="WIN RATE" />
            <Stat value={String(stats.distinctGames)} label="GAMES" />
            <Stat
              value={joinedDays === null ? '-' : `${joinedDays}d`}
              label="JOINED"
            />
          </div>

          {stats.mostPlayed && (
            <div className="card profile-most-played" style={{ maxWidth: 600 }}>
              <GameIcon gameType={stats.mostPlayed.gameType} size={36} />
              <span style={{ flex: 1, minWidth: 0, color: 'var(--text-2)' }}>
                Most played ·{' '}
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                  {GAME_LABELS[stats.mostPlayed.gameType]}
                </span>
              </span>
              <span className="mono" style={{ color: 'var(--text-3)' }}>
                {stats.mostPlayed.matches} matches
              </span>
            </div>
          )}

          <div className="section-head">
            <span className="card-label">ACHIEVEMENTS</span>
            <span className="muted">
              {unlocked} of {badges.length} earned
            </span>
          </div>

          <div className="achievement-grid" style={{ marginTop: 'calc(-1 * var(--s-3))' }}>
            {badges.map(badge => (
              <Badge key={badge.id} badge={badge} />
            ))}
          </div>

          <div className="hairline-fade" />

          <div>
            <div className="section-head">
              <span className="card-label">NET EARNED</span>
              <span className="muted">Across every staked match</span>
            </div>
            {earnings.length === 0 ? (
              <p className="bs-hint" style={{ marginTop: 'var(--s-4)' }}>
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
        </div>

        <aside
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}
        >
          <div className="card-gold">
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}
            >
              <span className="icon-tile is-gold">
                <UsersThree size={17} weight="fill" color="var(--gold)" />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  Invite and earn
                </div>
                <p
                  style={{
                    margin: 'var(--s-2) 0 0',
                    fontSize: 11,
                    lineHeight: 1.45,
                    color: 'var(--text-2)',
                  }}
                >
                  A slice of the fee from every match your invites play.
                </p>
              </div>
            </div>

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
                <ShareNetwork size={14} weight="bold" color="var(--gold)" />
              </button>
            ) : (
              <p className="bs-hint" style={{ marginTop: 'var(--s-4)' }}>
                Pick a username to get your code.
              </p>
            )}

            <div className="profile-stats">
              <Stat
                value={String(stats.referrals)}
                label="INVITED"
                color="var(--gold)"
              />
            </div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="card-label">SETTINGS</span>
            <div className="settings-list">
              <div className="settings-row">
                <User size={17} color="var(--text-3)" />
                <span className="settings-name">Username</span>
                <span className="settings-value">{user.username ?? '-'}</span>
              </div>
              <div className="settings-row">
                <Wallet size={17} color="var(--text-3)" />
                <span className="settings-name">Wallet</span>
                <span className="settings-value mono">
                  {address ? shortAddress(address) : 'Disconnected'}
                </span>
              </div>
              <div className="settings-row">
                <GlobeHemisphereWest size={17} color="var(--text-3)" />
                <span className="settings-name">Network</span>
                <span className="settings-value">{CHAIN_NAME}</span>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-danger btn-block"
              style={{ marginTop: 'var(--s-5)' }}
              onClick={() => {
                disconnect();
                void signOut();
              }}
            >
              <SignOut size={15} weight="bold" />
              Log out
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Badge({ badge }: { badge: Achievement }) {
  const Glyph = badge.unlocked ? (BADGE_ICONS[badge.id] ?? Trophy) : LockSimple;
  return (
    <div className={badge.unlocked ? 'achievement' : 'achievement is-locked'}>
      <span className="achievement-ring">
        <Glyph
          size={24}
          weight="bold"
          color={badge.unlocked ? 'var(--ink)' : 'var(--text-3)'}
        />
      </span>
      <span className="achievement-name">{badge.label}</span>
      <span className="achievement-req">{badge.requirement}</span>
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
