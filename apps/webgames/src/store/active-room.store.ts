import type { GameRoomSummary } from '@gaming-platform/core';
import { create } from 'zustand';

import { apiClient } from '../lib/api';

type ActiveRoomState = {
  /** The caller's own open room (waiting or live), or null when they have none. */
  room: GameRoomSummary | null;
  forfeiting: boolean;
  refresh: () => Promise<void>;
  setRoom: (room: GameRoomSummary | null) => void;
  patchRoom: (
    update: (room: GameRoomSummary | null) => GameRoomSummary | null,
  ) => void;
  forfeit: () => Promise<void>;
};

export const useActiveRoomStore = create<ActiveRoomState>((set, get) => ({
  room: null,
  forfeiting: false,

  refresh: async () => {
    try {
      set({ room: await apiClient.getMyActiveGameRoom() });
    } catch {
      set({ room: null });
    }
  },

  setRoom: room => set({ room }),

  patchRoom: update => set(state => ({ room: update(state.room) })),

  forfeit: async () => {
    const { room } = get();
    if (!room) return;
    set({ forfeiting: true });
    try {
      await apiClient.forfeitGameRoom(room.id);
    } catch {
      // The match may already be over (lost on the turn clock while away);
      // drop it either way so the prompt does not come back for a dead room.
    } finally {
      set({ room: null, forfeiting: false });
    }
  },
}));
