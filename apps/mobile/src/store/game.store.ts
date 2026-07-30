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
  /** Players currently in the waiting room, creator included. */
  waitingJoinedCount: number;
  /** True when the user is a joiner of someone else's room (Ludo) - flips
   *  Cancel from "close the room" to "leave the room". */
  waitingAsJoiner: boolean;
  isMinimized: boolean;
  isCancelling: boolean;
  isStarting: boolean;
  /** An in-progress match the user can rejoin after reopening the app. */
  resumableMatch: GameRoomSummary | null;
  isForfeiting: boolean;
  /** A staked room is escrowing both stakes (stake:funding received; waiting
   *  for stake:funded/failed). Drives the "setting up your match" overlay. */

  setWaitingRoom: (room: GameRoomSummary, asJoiner?: boolean) => void;
  setWaitingJoinedCount: (count: number) => void;
  minimize: () => void;
  expand: () => void;
  /** Closes (creator) or leaves (joiner) the room server-side, then clears
   *  local state either way. */
  cancelWaitingRoom: () => Promise<void>;
  /** Creator-only early start (Ludo). The started push does the navigation. */
  startWaitingRoom: () => Promise<void>;
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
  | 'waitingJoinedCount'
  | 'waitingAsJoiner'
  | 'isMinimized'
  | 'isCancelling'
  | 'isStarting'
  | 'resumableMatch'
  | 'isForfeiting'
> = {
  waitingRoom: null,
  waitingJoinedCount: 1,
  waitingAsJoiner: false,
  isMinimized: false,
  isCancelling: false,
  isStarting: false,
  resumableMatch: null,
  isForfeiting: false,
};

export const useGameStore = create<GameState>((set, get) => ({
  ...EMPTY,

  setWaitingRoom: (room, asJoiner = false) =>
    set({
      waitingRoom: room,
      waitingJoinedCount: room.joinedCount,
      waitingAsJoiner: asJoiner,
      isMinimized: false,
    }),
  setWaitingJoinedCount: count => set({ waitingJoinedCount: count }),
  minimize: () => set({ isMinimized: true }),
  expand: () => set({ isMinimized: false }),

  cancelWaitingRoom: async () => {
    const { waitingRoom, waitingAsJoiner } = get();
    if (!waitingRoom) {
      return;
    }
    set({ isCancelling: true });
    try {
      if (waitingAsJoiner) {
        await apiClient.leaveGameRoom(waitingRoom.id);
      } else {
        await apiClient.closeGameRoom(waitingRoom.id);
      }
    } catch {
      // Room may have already started/closed elsewhere - clear the local
      // guess either way so the UI doesn't offer to cancel a stale room.
    } finally {
      set({
        waitingRoom: null,
        waitingJoinedCount: 1,
        waitingAsJoiner: false,
        isMinimized: false,
        isCancelling: false,
      });
    }
  },

  startWaitingRoom: async () => {
    const { waitingRoom } = get();
    if (!waitingRoom) {
      return;
    }
    set({ isStarting: true });
    try {
      await apiClient.startGameRoom(waitingRoom.id);
      // The game:started push (or stake:funding for staked rooms) drives
      // what happens next; the popup stays until it arrives.
    } finally {
      set({ isStarting: false });
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
