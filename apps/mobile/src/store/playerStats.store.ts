import { create } from 'zustand';
import { emptyPlayerStats, type PlayerStats } from '@gaming-platform/core';

import { apiClient } from '../api/client';

const FRESH_MS = 60_000;

/** Older servers omit fields, and interpolating undefined renders the string "undefined". */
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
    if (inFlight) {
      return inFlight;
    }
    inFlight = apiClient
      .getMyStats()
      .then(stats => {
        set({ stats: normalize(stats), fetchedAt: Date.now() });
      })
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
