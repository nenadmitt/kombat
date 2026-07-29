import type { StakeAsset } from '../games/stake.types';

/**
 * A player's lifetime record, aggregated server-side from completed rooms.
 * This is the only source the Profile screen reads - nothing is derived from
 * a paginated history feed, which would only ever see one page of matches.
 */
export type PlayerStats = {
  /** Completed matches this player took part in, void ones included. */
  games: number;
  wins: number;
  losses: number;
  /** Matches that ended without a winner (voided stakes). */
  voids: number;
  /**
   * Net base-unit change per staked asset: winnings minus the stakes put up.
   * Only assets the player has actually staked appear.
   */
  netByToken: Partial<Record<StakeAsset, string>>;
  /** How many players signed up with this player's referral code. */
  referrals: number;
};

export const emptyPlayerStats = (): PlayerStats => ({
  games: 0,
  wins: 0,
  losses: 0,
  voids: 0,
  netByToken: {},
  referrals: 0,
});

/** Wins as a percentage of decided (non-void) matches. 0 before the first. */
export function winRate(stats: PlayerStats): number {
  const decided = stats.wins + stats.losses;
  return decided === 0 ? 0 : Math.round((stats.wins / decided) * 100);
}

/**
 * Level curve. There is no XP system, so a level is a plain read of how much
 * someone has played: each level costs 25% more matches than the last,
 * starting at 3. Level 1 from the first game, ~level 10 around 90 matches.
 * Deterministic, so the client and server never disagree.
 */
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

/** Matches still to play before the next level. */
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
  /** One line explaining how it is earned, shown when locked. */
  requirement: string;
  unlocked: boolean;
};

/** Any staked asset with a positive net counts toward the Whale badge. */
const hasPositiveNet = (stats: PlayerStats): boolean =>
  Object.values(stats.netByToken).some(net => {
    try {
      return BigInt(net) > 0n;
    } catch {
      return false;
    }
  });

/**
 * Badges are derived from the lifetime record rather than stored, so they
 * stay honest with no extra bookkeeping. Order is stable: the Profile screen
 * shows the first few and unlocked ones sort first.
 */
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
