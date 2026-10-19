import {
  emptyStakePotBalances,
  ApiError,
  type StakePotBalances,
} from '@gaming-platform/core';
import { create } from 'zustand';

import { apiClient } from '../lib/api';

type PotState = {
  balances: StakePotBalances;
  enabled: boolean;
  loaded: boolean;
  refresh: () => Promise<void>;
  apply: (balances: StakePotBalances) => void;
};

export const usePotStore = create<PotState>(set => ({
  balances: emptyStakePotBalances(),
  enabled: true,
  loaded: false,

  refresh: async () => {
    try {
      const balances = await apiClient.getStakePotBalances();
      set({ balances, enabled: true, loaded: true });
    } catch (error) {
      // 503 is the whole module being off, not a failure worth surfacing.
      const disabled = error instanceof ApiError && error.status === 503;
      set({ enabled: !disabled, loaded: true });
    }
  },

  apply: balances => set({ balances, enabled: true, loaded: true }),
}));
