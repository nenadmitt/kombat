/** Mirrors the shapes returned by the platform API's /admin/stats routes. */

export interface TypeCount {
  gameType: number;
  gameTypeLabel: string;
  total: number;
  staked: number;
}

export interface StatsOverview {
  users: {
    total: number;
    online: number;
    /** null until the platform API's users.platform column exists. */
    byPlatform: { platform: number; label: string; users: number }[] | null;
  };
  games: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
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
  platform: number | null;
  platformLabel: string | null;
  totals: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    staked: number;
    free: number;
    wins: number;
    voids: number;
    losses: number;
    created: number;
  };
  byType: TypeCount[];
}
