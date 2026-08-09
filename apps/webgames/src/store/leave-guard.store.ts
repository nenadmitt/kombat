import { create } from 'zustand';

type LeaveGuardState = {
  /**
   * Set by a live board. Anything that navigates out of the app shell hands
   * its exit here instead of running it, and the board decides.
   */
  intercept: ((proceed: () => void) => void) | null;
  arm: (intercept: (proceed: () => void) => void) => void;
  disarm: () => void;
};

export const useLeaveGuardStore = create<LeaveGuardState>(set => ({
  intercept: null,
  arm: intercept => set({ intercept }),
  disarm: () => set({ intercept: null }),
}));
