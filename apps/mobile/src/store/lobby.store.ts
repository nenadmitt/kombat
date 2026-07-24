import { create } from 'zustand';
import {
  ApiError,
  type GameRoomSummary,
  type LobbyRoomFilters,
} from '@gaming-platform/core';

import { apiClient } from '../api/client';
import { useCurrentUserStore } from './currentUser.store';
import { useServerStore } from './server.store';

/**
 * Short cache so bouncing between tabs doesn't re-hit the API: a focus within
 * this window reuses the last list (the WebSocket keeps it live while you're
 * actually on the lobby). Deliberately low - the lobby is money-sensitive.
 */
const CACHE_TTL_MS = 20_000;

export type LobbyStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Default (no constraints) filters. */
export const EMPTY_FILTERS: LobbyRoomFilters = {
  gameTypes: [],
  stake: 'all',
  stakeTokens: [],
};

/** Does a room satisfy the active filters? Re-applied to live room-added
 *  events since the server only filters the initial fetch. */
export function roomMatchesFilters(
  room: GameRoomSummary,
  filters: LobbyRoomFilters,
): boolean {
  if (filters.gameTypes?.length && !filters.gameTypes.includes(room.gameType)) {
    return false;
  }
  if (filters.stake === 'free' && room.stakeToken !== null) return false;
  if (filters.stake === 'staked' && room.stakeToken === null) return false;
  if (
    filters.stakeTokens?.length &&
    (room.stakeToken === null || !filters.stakeTokens.includes(room.stakeToken))
  ) {
    return false;
  }
  return true;
}

/** True when any filter is narrowing the list (used for the "clear" affordance). */
export function hasActiveFilters(filters: LobbyRoomFilters): boolean {
  return (
    !!filters.gameTypes?.length ||
    (filters.stake ?? 'all') !== 'all' ||
    !!filters.stakeTokens?.length
  );
}

type LobbyState = {
  rooms: GameRoomSummary[];
  status: LobbyStatus;
  error: string | null;
  filters: LobbyRoomFilters;
  lastFetchedAt: number;

  /** Fetch the list. Skips the network if the cache is still fresh, unless
   *  `force` (manual refresh / filter change). */
  fetch: (opts?: { force?: boolean }) => Promise<void>;
  /** Replace the filters and refetch (a filter change is a new server query). */
  setFilters: (filters: LobbyRoomFilters) => void;

  // WebSocket patches (creator's own rooms and rooms failing the active
  // filters are dropped - the server broadcasts to every lobby viewer).
  applyAdded: (room: GameRoomSummary) => void;
  applyRemoved: (roomId: string) => void;
  applyUpdated: (room: GameRoomSummary) => void;
};

const byCreatedAtAsc = (a: GameRoomSummary, b: GameRoomSummary) =>
  a.createdAt.localeCompare(b.createdAt);

function isMine(room: GameRoomSummary): boolean {
  return room.creatorUserId === useCurrentUserStore.getState().userId;
}

export const useLobbyStore = create<LobbyState>((set, get) => ({
  rooms: [],
  status: 'idle',
  error: null,
  filters: EMPTY_FILTERS,
  lastFetchedAt: 0,

  fetch: async ({ force = false } = {}) => {
    const { status, lastFetchedAt } = get();
    if (
      !force &&
      status === 'ready' &&
      Date.now() - lastFetchedAt < CACHE_TTL_MS
    ) {
      return; // Cache still fresh - don't spam the API on tab switches.
    }
    set({ status: 'loading', error: null });
    try {
      const rooms = await apiClient.listPendingGameRooms({
        excludeOwn: true,
        filters: get().filters,
      });
      set({ rooms, status: 'ready', lastFetchedAt: Date.now() });
    } catch (err) {
      if (err instanceof ApiError && err.isNetworkError) {
        useServerStore.getState().reportOffline();
      }
      set({
        status: 'error',
        error:
          err instanceof ApiError ? err.message : 'Failed to load game rooms',
      });
    }
  },

  setFilters: filters => {
    set({ filters });
    // A new filter set is a new query - bypass the cache.
    void get().fetch({ force: true });
  },

  applyAdded: room => {
    if (isMine(room) || !roomMatchesFilters(room, get().filters)) return;
    set(state =>
      state.rooms.some(r => r.id === room.id)
        ? state
        : { rooms: [...state.rooms, room].sort(byCreatedAtAsc) },
    );
  },

  applyRemoved: roomId => {
    set(state => {
      if (!state.rooms.some(r => r.id === roomId)) return state;
      return { rooms: state.rooms.filter(r => r.id !== roomId) };
    });
  },

  applyUpdated: room => {
    if (isMine(room) || !roomMatchesFilters(room, get().filters)) {
      // No longer belongs in this view (e.g. filtered out) - drop it if present.
      get().applyRemoved(room.id);
      return;
    }
    set(state => {
      const exists = state.rooms.some(r => r.id === room.id);
      const rooms = exists
        ? state.rooms.map(r => (r.id === room.id ? room : r))
        : [...state.rooms, room].sort(byCreatedAtAsc);
      return { rooms };
    });
  },
}));
