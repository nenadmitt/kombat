import type { TokenSymbol } from './tokens';

/**
 * MOCK market movement — placeholder until a price-history feed exists. Used
 * only for the growth badge and the decorative asset/balance sparklines; real
 * balances are always on-chain. Zero these out or wire real data later.
 */
export const MOCK_WEEK_CHANGE = { pct: '12.4%', abs: '+$676.40', up: true };

/** MOCK gas estimate — no fee estimation yet. */
export const NETWORK_FEE_USD = '~$0.12';

export const MOCK_BALANCE_SPARK = [3, 3.4, 3.2, 3.9, 3.7, 4.4, 4.2, 4.9, 5.2, 5.6];

type Trend = { pct: string; up: boolean; spark: number[] };

export const MOCK_TRENDS: Record<TokenSymbol, Trend> = {
  USDC: { pct: '+0.0%', up: true, spark: [4, 4.1, 4, 4.05, 4, 4.03, 4.01] },
  USDT: { pct: '+0.1%', up: true, spark: [4, 4, 4.06, 4, 4.05, 4.03, 4.05] },
  ETH: { pct: '+8.2%', up: true, spark: [2, 2.4, 2.2, 3, 3.4, 4, 4.6] },
  KOMBAT: { pct: '-3.4%', up: false, spark: [5, 4.7, 4.9, 4.3, 4, 3.7, 3.5] },
};
