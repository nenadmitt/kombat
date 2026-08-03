import { formatUnits, type Address } from 'viem';
import { create } from 'zustand';

import { fetchBalances } from '../wallet/balance-client';
import {
  CHAIN_TOKENS,
  type BalanceChainId,
  type TokenSymbol,
} from '../wallet/tokens';

export const MANUAL_REFRESH_COOLDOWN_MS = 8000;

export type BalanceStatus = 'idle' | 'loading' | 'ready' | 'error';

export type TokenBalance = { raw: bigint | null; formatted: string };

type ChainBalances = {
  status: BalanceStatus;
  balances: Partial<Record<TokenSymbol, TokenBalance>>;
  /** ETH/USD price (8 decimals) captured with this refresh; null if unavailable. */
  ethUsdPrice: bigint | null;
  error: string | null;
  updatedAt: number | null;
};

type WalletBalancesState = {
  byChain: Partial<Record<BalanceChainId, ChainBalances>>;
  lastManualRefreshAt: number;
  refresh: (
    chainId: BalanceChainId,
    address: Address,
    opts?: { manual?: boolean },
  ) => Promise<void>;
};

const UNAVAILABLE = '-';

/** Thousand-separated amount without relying on Intl (limited under Hermes). */
function formatAmount(raw: bigint, decimals: number): string {
  if (raw === 0n) {
    return '0.00';
  }
  const full = formatUnits(raw, decimals);
  const [intPart, fracPart = ''] = full.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const maxFrac = Number(full) >= 1 ? 2 : 6;
  const frac = fracPart.slice(0, maxFrac).replace(/0+$/, '');
  return frac ? `${withCommas}.${frac}` : `${withCommas}.00`;
}

export const useWalletBalancesStore = create<WalletBalancesState>((set, get) => ({
  byChain: {},
  lastManualRefreshAt: 0,

  refresh: async (chainId, address, opts) => {
    const manual = opts?.manual ?? false;
    const current = get().byChain[chainId];
    if (current?.status === 'loading') {
      return;
    }
    if (
      manual &&
      Date.now() - get().lastManualRefreshAt < MANUAL_REFRESH_COOLDOWN_MS
    ) {
      return;
    }

    set(state => ({
      byChain: {
        ...state.byChain,
        [chainId]: {
          status: 'loading',
          balances: current?.balances ?? {},
          ethUsdPrice: current?.ethUsdPrice ?? null,
          error: null,
          updatedAt: current?.updatedAt ?? null,
        },
      },
      lastManualRefreshAt: manual ? Date.now() : state.lastManualRefreshAt,
    }));

    try {
      const { balances: raw, ethUsdPrice } = await fetchBalances(chainId, address);
      const balances: Partial<Record<TokenSymbol, TokenBalance>> = {};
      for (const token of CHAIN_TOKENS[chainId]) {
        // No address on this chain → treat as no funds.
        if (!token.native && !token.address) {
          balances[token.symbol] = { raw: 0n, formatted: '0.00' };
          continue;
        }
        const value = raw[token.symbol] ?? null;
        balances[token.symbol] = {
          raw: value,
          formatted:
            value === null ? UNAVAILABLE : formatAmount(value, token.decimals),
        };
      }
      set(state => ({
        byChain: {
          ...state.byChain,
          [chainId]: {
            status: 'ready',
            balances,
            ethUsdPrice,
            error: null,
            updatedAt: Date.now(),
          },
        },
      }));
    } catch (err) {
      set(state => ({
        byChain: {
          ...state.byChain,
          [chainId]: {
            status: 'error',
            balances: state.byChain[chainId]?.balances ?? {},
            ethUsdPrice: state.byChain[chainId]?.ethUsdPrice ?? null,
            error: err instanceof Error ? err.message : 'Failed to load balances',
            updatedAt: state.byChain[chainId]?.updatedAt ?? null,
          },
        },
      }));
    }
  },
}));

