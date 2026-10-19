import { create } from 'zustand';

type LeaveGuardState = {
  /** Set by a live board: exits out of the shell are handed here and the board decides. */
  intercept: ((proceed: () => void) => void) | null;
  arm: (intercept: (proceed: () => void) => void) => void;
  disarm: () => void;
};

export const useLeaveGuardStore = create<LeaveGuardState>(set => ({
  intercept: null,
  arm: intercept => set({ intercept }),
  disarm: () => set({ intercept: null }),
}));
