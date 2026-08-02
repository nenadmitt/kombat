import { create } from 'zustand';
import { emptyPlayerStats, type PlayerStats } from '@gaming-platform/core';

import { apiClient } from '../api/client';

/**
 * How long a fetched aggregate stays fresh. Both screens that read it are
 * tab destinations, so without this every tab switch re-runs the whole
 * lifetime aggregate on the server.
 */
const FRESH_MS = 60_000;

/**
 * A server that predates a field sends it as absent, and interpolating that
 * straight into a Text renders the string "undefined". Every field falls back
 * to its empty-record default instead.
 */
function normalize(raw: Partial<PlayerStats> | null | undefined): PlayerStats {
  const base = emptyPlayerStats();
  if (!raw) {
    return base;
  }
  return {
    games: raw.games ?? base.games,
    wins: raw.wins ?? base.wins,
    losses: raw.losses ?? base.losses,
    voids: raw.voids ?? base.voids,
    netByToken: raw.netByToken ?? base.netByToken,
    referrals: raw.referrals ?? base.referrals,
    bestStreak: raw.bestStreak ?? base.bestStreak,
    distinctGames: raw.distinctGames ?? base.distinctGames,
    joinedAt: raw.joinedAt ?? base.joinedAt,
    mostPlayed: raw.mostPlayed ?? base.mostPlayed,
  };
}

type PlayerStatsState = {
  stats: PlayerStats;
  fetchedAt: number | null;
  /** Serves the cache when it is still fresh; `force` skips that check. */
  load: (options?: { force?: boolean }) => Promise<void>;
  clear: () => void;
};

let inFlight: Promise<void> | null = null;

export const usePlayerStatsStore = create<PlayerStatsState>((set, get) => ({
  stats: emptyPlayerStats(),
  fetchedAt: null,

  load: async ({ force = false } = {}) => {
    const { fetchedAt } = get();
    if (!force && fetchedAt !== null && Date.now() - fetchedAt < FRESH_MS) {
      return;
    }
    // Both tabs can ask at once on a cold start; they share the one request.
    if (inFlight) {
      return inFlight;
    }
    inFlight = apiClient
      .getMyStats()
      .then(stats => {
        set({ stats: normalize(stats), fetchedAt: Date.now() });
      })
      // Callers render the last good aggregate (zeroes on a cold start)
      // rather than blocking on a stat that decorates the screen.
      .catch(() => undefined)
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  },

  clear: () => {
    inFlight = null;
    set({ stats: emptyPlayerStats(), fetchedAt: null });
  },
}));
