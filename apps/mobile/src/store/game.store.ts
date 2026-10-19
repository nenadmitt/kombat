import { create } from 'zustand';
import type { GameRoomSummary } from '@gaming-platform/core';

import { apiClient } from '../api/client';

type GameState = {
  waitingRoom: GameRoomSummary | null;
  waitingJoinedCount: number;
  waitingAsJoiner: boolean;
  isMinimized: boolean;
  isCancelling: boolean;
  isStarting: boolean;
  resumableMatch: GameRoomSummary | null;
  isForfeiting: boolean;

  setWaitingRoom: (room: GameRoomSummary, asJoiner?: boolean) => void;
  setWaitingJoinedCount: (count: number) => void;
  minimize: () => void;
  expand: () => void;
  cancelWaitingRoom: () => Promise<void>;
  startWaitingRoom: () => Promise<void>;
  setResumableMatch: (room: GameRoomSummary) => void;
  clearResumableMatch: () => void;
  forfeitResumableMatch: () => Promise<void>;
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
    } finally {
      set({ resumableMatch: null, isForfeiting: false });
    }
  },

  clear: () => set({ ...EMPTY }),
}));
