/** Mirrors the shapes returned by the platform API's /admin/stats routes. */

export interface TypeCount {
  gameType: number;
  gameTypeLabel: string;
  total: number;
  staked: number;
}

export interface StatsOverview {
  users: {
    /** Real players; bots are counted separately. */
    total: number;
    bots: number;
    /** Real players connected right now - bots are never counted. */
    online: number;
    /** null until the platform API's users.platform column exists. */
    byPlatform: { platform: number; label: string; users: number }[] | null;
  };
  games: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    /** Completed with a winner - matches that were actually played out. */
    played: number;
    /** Completed with no winner: forfeits before a result, voided matches. */
    voided: number;
    staked: number;
    free: number;
    byType: TypeCount[];
  };
}

export interface UserStatsRow {
  id: string;
  email: string | null;
  username: string | null;
  createdAt: string;
  online: boolean;
  isBot: boolean;
  platform: number | null;
  platformLabel: string | null;
  games: number;
  staked: number;
  free: number;
}

export interface UserStats {
  id: string;
  email: string | null;
  username: string | null;
  ensName: string | null;
  referralCode: string | null;
  referredByUserId: string | null;
  createdAt: string;
  online: boolean;
  isBot: boolean;
  platform: number | null;
  platformLabel: string | null;
  totals: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    played: number;
    voided: number;
    staked: number;
    free: number;
    wins: number;
    voids: number;
    losses: number;
    created: number;
  };
  byType: TypeCount[];
}
