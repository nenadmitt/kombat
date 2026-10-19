import {
  STAKE_ASSETS,
  emptyStakePotBalances,
  type StakePotBalances,
} from '@gaming-platform/core';
import { create } from 'zustand';

import { apiClient } from '../api/client';

export type StakePotStatus = 'idle' | 'loading' | 'ready' | 'error';

type StakePotState = {
  status: StakePotStatus;
  balances: StakePotBalances;
  unavailable: boolean;
  error: string | null;
  updatedAt: number | null;
  refresh: () => Promise<void>;
  apply: (balances: StakePotBalances) => void;
};

export const useStakePotStore = create<StakePotState>((set, get) => ({
  status: 'idle',
  balances: emptyStakePotBalances(),
  unavailable: false,
  error: null,
  updatedAt: null,

  refresh: async () => {
    if (get().status === 'loading') {
      return;
    }
    set({ status: 'loading', error: null });
    try {
      const balances = await apiClient.getStakePotBalances();
      set({
        status: 'ready',
        balances,
        unavailable: false,
        error: null,
        updatedAt: Date.now(),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load your stake pot';
      // 503: this server runs without pooled staking; the card hides itself.
      const unavailable = /not configured/i.test(message);
      set({
        status: unavailable ? 'ready' : 'error',
        unavailable,
        error: unavailable ? null : message,
      });
    }
  },

  apply: balances =>
    set({
      status: 'ready',
      balances,
      unavailable: false,
      error: null,
      updatedAt: Date.now(),
    }),
}));

export function isStakePotEmpty(balances: StakePotBalances): boolean {
  return STAKE_ASSETS.every(
    asset =>
      balances.available[asset] === '0' &&
      balances.locked[asset] === '0' &&
      balances.pendingWithdrawals[asset] === '0',
  );
}
