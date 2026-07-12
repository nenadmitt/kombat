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
  /** An in-progress match the user can rejoin after reopening the app. */
  resumableMatch: GameRoomSummary | null;
  isForfeiting: boolean;
  /** A staked room is escrowing both stakes (stake:funding received; waiting
   *  for stake:funded/failed). Drives the "setting up your match" overlay. */
  isSecuringStakes: boolean;

  setWaitingRoom: (room: GameRoomSummary) => void;
  setSecuringStakes: (securing: boolean) => void;
  minimize: () => void;
  expand: () => void;
  /** Closes the room server-side, then clears local state either way. */
  cancelWaitingRoom: () => Promise<void>;
  setResumableMatch: (room: GameRoomSummary) => void;
  clearResumableMatch: () => void;
  /** Forfeits the resumable match server-side, then clears it either way. */
  forfeitResumableMatch: () => Promise<void>;
  /** Hard reset - used on logout so a stale popup can't follow a new session. */
  clear: () => void;
};

const EMPTY: Pick<
  GameState,
  | 'waitingRoom'
  | 'isMinimized'
  | 'isCancelling'
  | 'resumableMatch'
  | 'isForfeiting'
  | 'isSecuringStakes'
> = {
  waitingRoom: null,
  isMinimized: false,
  isCancelling: false,
  resumableMatch: null,
  isForfeiting: false,
  isSecuringStakes: false,
};

export const useGameStore = create<GameState>((set, get) => ({
  ...EMPTY,

  setWaitingRoom: room => set({ waitingRoom: room, isMinimized: false }),
  setSecuringStakes: securing => set({ isSecuringStakes: securing }),
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
      // Room may have already started/closed elsewhere - clear the local
      // guess either way so the UI doesn't offer to cancel a stale room.
    } finally {
      set({ waitingRoom: null, isMinimized: false, isCancelling: false });
    }
  },

  setResumableMatch: room => set({ resumableMatch: room }),
  clearResumableMatch: () => set({ resumableMatch: null }),

  forfeitResumableMatch: async () => {
    const { resumableMatch } = get();
    if (!resumableMatch) {
      return;
    }
    set({ isForfeiting: true });
    try {
      await apiClient.forfeitGameRoom(resumableMatch.id);
    } catch {
      // Match may already be over (e.g. lost by timeout while away) - clear the
      // local guess either way so we don't keep prompting for a dead match.
    } finally {
      set({ resumableMatch: null, isForfeiting: false });
    }
  },

  clear: () => set({ ...EMPTY }),
}));
