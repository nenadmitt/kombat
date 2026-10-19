import type { GameType } from '../games/game-room.types';
import type { StakeAsset } from '../games/stake.types';

export type PlayerStats = {
  /** Void matches included. */
  games: number;
  wins: number;
  losses: number;
  voids: number;
  netByToken: Partial<Record<StakeAsset, string>>;
  referrals: number;
  bestStreak: number;
  distinctGames: number;
  /** Null only if the row predates the column. */
  joinedAt: string | null;
  mostPlayed: { gameType: GameType; matches: number } | null;
};

export const emptyPlayerStats = (): PlayerStats => ({
  games: 0,
  wins: 0,
  losses: 0,
  voids: 0,
  netByToken: {},
  referrals: 0,
  bestStreak: 0,
  distinctGames: 0,
  joinedAt: null,
  mostPlayed: null,
});

export function winRate(stats: PlayerStats): number {
  const decided = stats.wins + stats.losses;
  return decided === 0 ? 0 : Math.round((stats.wins / decided) * 100);
}

/** Each level costs 25% more matches than the last, starting at 3. */
export function levelForGames(games: number): number {
  let level = 0;
  let remaining = games;
  let cost = 3;
  while (remaining >= cost) {
    remaining -= cost;
    level += 1;
    cost = Math.ceil(cost * 1.25);
  }
  return level;
}

export function gamesToNextLevel(games: number): number {
  const level = levelForGames(games);
  let total = 0;
  let cost = 3;
  for (let i = 0; i <= level; i++) {
    total += cost;
    cost = Math.ceil(cost * 1.25);
  }
  return Math.max(0, total - games);
}

export type AchievementId = 'first-blood' | 'top-gun' | 'veteran' | 'whale';

export type Achievement = {
  id: AchievementId;
  label: string;
  requirement: string;
  unlocked: boolean;
};

const hasPositiveNet = (stats: PlayerStats): boolean =>
  Object.values(stats.netByToken).some(net => {
    try {
      return BigInt(net) > 0n;
    } catch {
      return false;
    }
  });

/** Order is stable: the Profile screen shows only the first few. */
export function achievementsFor(stats: PlayerStats): Achievement[] {
  return [
    {
      id: 'first-blood',
      label: 'First Blood',
      requirement: 'Win your first match',
      unlocked: stats.wins >= 1,
    },
    {
      id: 'top-gun',
      label: 'Top Gun',
      requirement: 'Win 60% of 10+ decided matches',
      unlocked: stats.wins + stats.losses >= 10 && winRate(stats) >= 60,
    },
    {
      id: 'veteran',
      label: 'Veteran',
      requirement: 'Play 50 matches',
      unlocked: stats.games >= 50,
    },
    {
      id: 'whale',
      label: 'Whale',
      requirement: 'Finish ahead on a staked asset',
      unlocked: hasPositiveNet(stats),
    },
  ];
}
