import {
  achievementsFor,
  formatStakeAmount,
  levelForGames,
  STAKE_ASSET_SYMBOLS,
  winRate,
  type PlayerStats,
  type StakeAsset,
  type UserProfile,
} from '@gaming-platform/core';
import {
  Crown,
  Flame,
  LockSimple,
  Trophy,
  UsersThree,
  type Icon,
} from '@phosphor-icons/react';
import { useState } from 'react';

import { GameIcon } from './GameIcon';
import { GAME_LABELS, initialOf } from '../lib/format';
import { sessionStorage } from '../lib/session-storage';

const BADGE_ICONS: Icon[] = [Trophy, Flame, Crown, Trophy];

export function ProfileCard({
  user,
  stats,
}: {
  user: UserProfile;
  stats: PlayerStats;
}) {
  const color = sessionStorage.readColor() ?? 'var(--lime)';
  const joinedDays = stats.joinedAt
    ? Math.max(
        1,
        Math.round(
          (Date.now() - new Date(stats.joinedAt).getTime()) / 86_400_000,
        ),
      )
    : null;

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)' }}>
        <span
          className="avatar"
          style={{ width: 56, height: 56, fontSize: 24, background: color }}
        >
          {initialOf(user.username)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: '-0.02em' }}>
            {user.username ?? 'Unnamed'}
          </div>
          <div
            className="mono"
            style={{
              marginTop: 'var(--s-2)',
              fontSize: 11,
              color: 'var(--text-3)',
            }}
          >
            {user.ensName ?? `Level ${levelForGames(stats.games)}`}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 'var(--s-5)',
        }}
      >
        <MiniStat value={String(stats.bestStreak)} label="STREAK" lime />
        <MiniStat value={String(stats.games)} label="MATCHES" />
        <MiniStat value={String(stats.distinctGames)} label="GAMES" />
        <MiniStat value={joinedDays ? `${joinedDays}d` : '-'} label="JOINED" />
      </div>

      {stats.mostPlayed && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-3)',
            marginTop: 'var(--s-5)',
            paddingTop: 'var(--s-4)',
            boxShadow: 'inset 0 1px 0 var(--hairline-strong)',
          }}
        >
          <GameIcon gameType={stats.mostPlayed.gameType} size={28} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-2)' }}>
            Most played{' '}
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>
              {GAME_LABELS[stats.mostPlayed.gameType]}
            </span>
          </span>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
            {stats.mostPlayed.matches}
          </span>
        </div>
      )}
    </div>
  );
}

export function AchievementsCard({ stats }: { stats: PlayerStats }) {
  const badges = achievementsFor(stats);
  const unlocked = badges.filter(badge => badge.unlocked).length;

  return (
    <div className="card">
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <span className="card-label">ACHIEVEMENTS</span>
        <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
          {unlocked} of {badges.length}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 'var(--s-3)', marginTop: 'var(--s-5)' }}>
        {badges.map((badge, index) => {
          const Glyph = badge.unlocked ? (BADGE_ICONS[index] ?? Trophy) : LockSimple;
          return (
            <div
              key={badge.id}
              title={badge.unlocked ? badge.label : badge.requirement}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'var(--s-2)',
                opacity: badge.unlocked ? 1 : 0.32,
              }}
            >
              <span
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 'var(--r-pill)',
                  display: 'grid',
                  placeItems: 'center',
                  background: badge.unlocked ? 'var(--gold)' : 'transparent',
                  boxShadow: badge.unlocked
                    ? 'none'
                    : 'inset 0 0 0 1px rgba(255,255,255,.2)',
                }}
              >
                <Glyph
                  size={21}
                  weight="bold"
                  color={badge.unlocked ? 'var(--ink)' : 'var(--text-3)'}
                />
              </span>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 10,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}
              >
                {badge.unlocked ? badge.label : 'Locked'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function InviteCard({
  user,
  stats,
}: {
  user: UserProfile;
  stats: PlayerStats;
}) {
  const [copied, setCopied] = useState(false);
  const code = user.referralCode;

  async function copy() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card-gold">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--r-md)',
            background: 'var(--sunken)',
            display: 'grid',
            placeItems: 'center',
            flex: 'none',
          }}
        >
          <UsersThree size={17} weight="fill" color="var(--gold)" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Invite and earn</div>
          <div
            style={{
              marginTop: 'var(--s-2)',
              fontSize: 11,
              lineHeight: 1.45,
              color: 'var(--text-2)',
            }}
          >
            A slice of the fee from every match your invites play.
          </div>
        </div>
      </div>

      {code && (
        <button
          type="button"
          onClick={copy}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-3)',
            width: '100%',
            marginTop: 'var(--s-4)',
            padding: 'var(--s-3)',
            borderRadius: 'var(--r-md)',
            background: 'var(--sunken)',
          }}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: 'left',
              fontWeight: 700,
              fontSize: 12.5,
              letterSpacing: '0.05em',
              color: 'var(--gold)',
            }}
          >
            {code}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {copied ? 'Copied' : 'Copy'}
          </span>
        </button>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 'var(--s-4)',
        }}
      >
        <MiniStat value={String(stats.referrals)} label="INVITED" />
        <MiniStat value={String(stats.wins)} label="WINS" />
        <MiniStat value={`${winRate(stats)}%`} label="WIN RATE" gold />
      </div>
    </div>
  );
}

export function NetEarnings({ stats }: { stats: PlayerStats }) {
  const entries = Object.entries(stats.netByToken) as [string, string][];
  if (entries.length === 0) return null;
  const [assetKey, net] = entries[0]!;
  const asset = Number(assetKey) as StakeAsset;
  const positive = BigInt(net) >= 0n;

  return (
    <div>
      <div className="card-label">NET EARNED</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 'var(--s-2)',
          marginTop: 'var(--s-4)',
        }}
      >
        <span
          style={{
            fontWeight: 800,
            fontSize: 52,
            lineHeight: 1,
            letterSpacing: '-0.035em',
            color: positive ? 'var(--gold)' : 'var(--loss)',
          }}
        >
          {positive ? '+' : ''}
          {formatStakeAmount(net, asset)}
        </span>
        <span
          style={{ fontWeight: 700, fontSize: 15, color: 'rgba(245,184,41,.75)' }}
        >
          {STAKE_ASSET_SYMBOLS[asset]}
        </span>
      </div>
    </div>
  );
}

function MiniStat({
  value,
  label,
  lime = false,
  gold = false,
}: {
  value: string;
  label: string;
  lime?: boolean;
  gold?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontWeight: 800,
          fontSize: 19,
          lineHeight: 1,
          color: lime ? 'var(--lime)' : gold ? 'var(--gold)' : 'var(--text)',
        }}
      >
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
