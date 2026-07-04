import { create } from 'zustand';
import type { GameRoomSummary } from '@gaming-platform/core';

import { apiClient } from '../api/client';

/**
 * Tracks the game room the user is currently waiting in (if any), so the
 * "Waiting for Players" popup/minimized-bar can be mounted once above the
 * tab navigator and stay visible across tab switches, instead of being tied
 * to a single screen's local state.
 */
type GameState = {
  waitingRoom: GameRoomSummary | null;
  isMinimized: boolean;
  isCancelling: boolean;

  setWaitingRoom: (room: GameRoomSummary) => void;
  minimize: () => void;
  expand: () => void;
  /** Closes the room server-side, then clears local state either way. */
  cancelWaitingRoom: () => Promise<void>;
  /** Hard reset — used on logout so a stale popup can't follow a new session. */
  clear: () => void;
};

export const useGameStore = create<GameState>((set, get) => ({
  waitingRoom: null,
  isMinimized: false,
  isCancelling: false,

  setWaitingRoom: room => set({ waitingRoom: room, isMinimized: false }),
  minimize: () => set({ isMinimized: true }),
  expand: () => set({ isMinimized: false }),

  cancelWaitingRoom: async () => {
    const { waitingRoom } = get();
    if (!waitingRoom) {
      return;
    }
    set({ isCancelling: true });
    try {
      await apiClient.closeGameRoom(waitingRoom.id);
    } catch {
      // Room may have already started/closed elsewhere — clear the local
      // guess either way so the UI doesn't offer to cancel a stale room.
    } finally {
      set({ waitingRoom: null, isMinimized: false, isCancelling: false });
    }
  },

  clear: () => set({ waitingRoom: null, isMinimized: false, isCancelling: false }),
}));
