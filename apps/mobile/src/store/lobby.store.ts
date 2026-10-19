import { create } from 'zustand';
import {
  ApiError,
  type GameRoomSummary,
  type LobbyRoomFilters,
} from '@gaming-platform/core';

import { apiClient } from '../api/client';
import { useCurrentUserStore } from './currentUser.store';
import { useServerStore } from './server.store';

/** Deliberately short: the lobby is money-sensitive. */
const CACHE_TTL_MS = 20_000;

export type LobbyStatus = 'idle' | 'loading' | 'ready' | 'error';

export const EMPTY_FILTERS: LobbyRoomFilters = {
  gameTypes: [],
  stake: 'all',
  stakeTokens: [],
};

/** Re-applied to live room-added events since the server only filters the initial fetch. */
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

type LobbyState = {
  rooms: GameRoomSummary[];
  status: LobbyStatus;
  error: string | null;
  filters: LobbyRoomFilters;
  lastFetchedAt: number;

  fetch: (opts?: { force?: boolean }) => Promise<void>;
  setFilters: (filters: LobbyRoomFilters) => void;

  // The server broadcasts to every lobby viewer, so the creator's own rooms and rooms failing the filters are dropped.
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
      return;
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
