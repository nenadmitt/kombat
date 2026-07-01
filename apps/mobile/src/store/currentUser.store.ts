import { create } from 'zustand';

/**
 * Global store for the current (logged-in) user.
 * Long-lived: survives navigation across the whole app.
 * Start minimal (just a name); add auth/wallet/stats slices later.
 */
type Status = 'loading' | 'ready';

type CurrentUserState = {
  status: Status;
  name: string;
  /** Load the current user on app start (hardcoded for now — swap for API/storage later). */
  load: () => Promise<void>;
  /** Update the user's name. */
  setName: (name: string) => void;
  /** Clear the user (e.g. on logout). */
  reset: () => void;
};

export const useCurrentUserStore = create<CurrentUserState>(set => ({
  status: 'loading',
  name: '',
  load: async () => {
    set({ status: 'loading' });
    // Pretend we're fetching the user from an API / secure storage.
    await new Promise<void>(resolve => setTimeout(() => resolve(), 500));
    set({ name: 'Ada Lovelace', status: 'ready' });
  },
  setName: name => set({ name }),
  reset: () => set({ name: '' }),
}));
