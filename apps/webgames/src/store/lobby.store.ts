import {
  ApiError,
  GameType,
  type GameRoomSummary,
  type LobbyRoomFilters,
} from '@gaming-platform/core';
import { create } from 'zustand';

import { apiClient } from '../lib/api';

export const EMPTY_FILTERS: LobbyRoomFilters = {
  gameTypes: [],
  stake: 'all',
  stakeTokens: [],
};

// The server only filters the initial fetch, so live room-added events are re-checked here.
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
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  filters: LobbyRoomFilters;
  setGameTypeFilter: (gameType: GameType | null) => void;
  load: () => Promise<void>;
  upsert: (room: GameRoomSummary) => void;
  remove: (roomId: string) => void;
};

export const useLobbyStore = create<LobbyState>((set, get) => ({
  rooms: [],
  status: 'idle',
  error: null,
  filters: EMPTY_FILTERS,

  setGameTypeFilter: gameType => {
    set({
      filters: { ...get().filters, gameTypes: gameType === null ? [] : [gameType] },
    });
    void get().load();
  },

  load: async () => {
    set({ status: 'loading', error: null });
    try {
      const rooms = await apiClient.listPendingGameRooms({
        filters: get().filters,
      });
      set({ rooms, status: 'ready' });
    } catch (error) {
      set({
        status: 'error',
        error:
          error instanceof ApiError
            ? error.message
            : 'Could not load the lobby.',
      });
    }
  },

  upsert: room => {
    if (!roomMatchesFilters(room, get().filters)) return;
    set(state => {
      const rest = state.rooms.filter(existing => existing.id !== room.id);
      return { rooms: [...rest, room] };
    });
  },

  remove: roomId =>
    set(state => ({ rooms: state.rooms.filter(room => room.id !== roomId) })),
}));
