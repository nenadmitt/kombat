/**
 * Staking (game payments) — shared between server and clients.
 * Amounts cross the wire as base-unit ("wei") decimal strings; clients format
 * them via STAKE_ASSET_DECIMALS.
 */

/** Which asset a match is staked in. Stored server-side as smallint. */
export enum StakeAsset {
  Native = 0, // ETH
  Kombat = 1,
  Usdc = 2,
}

export const STAKE_ASSET_DECIMALS: Record<StakeAsset, number> = {
  [StakeAsset.Native]: 18,
  [StakeAsset.Kombat]: 18,
  [StakeAsset.Usdc]: 6,
};

export const STAKE_ASSET_SYMBOLS: Record<StakeAsset, string> = {
  [StakeAsset.Native]: 'ETH',
  [StakeAsset.Kombat]: 'KOMBAT',
  [StakeAsset.Usdc]: 'USDC',
};

/** Settlement lifecycle for a staked room. Free rooms have no row. */
export enum SettlementStatus {
  Funding = 0,
  Funded = 1,
  SettlePending = 2,
  Settled = 3,
  VoidPending = 4,
  Voided = 5,
  /** Terminal failure - needs manual attention. */
  Failed = 6,
}

/** Minimum stake per player, in base units (1 USDC / 0.001 ETH / 1 KOMBAT). */
export const STAKE_ASSET_MIN: Record<StakeAsset, string> = {
  [StakeAsset.Native]: '1000000000000000', // 0.001 ETH
  [StakeAsset.Kombat]: '1000000000000000000', // 1 KOMBAT
  [StakeAsset.Usdc]: '1000000', // 1 USDC
};

/** Socket events broadcast to a room's game channel during staking. */
export const STAKE_EVENTS = {
  /** Both players joined a staked room; stakes are being held. */
  funding: 'stake:funding',
  /** Stakes confirmed on-chain — the match may start. */
  funded: 'stake:funded',
  /** Funding failed — the room is voided and anything pulled is refunded. */
  failed: 'stake:failed',
} as const;

/** Format a base-unit amount string for display (trims trailing zeros). */
export function formatStakeAmount(amount: string, asset: StakeAsset): string {
  const decimals = STAKE_ASSET_DECIMALS[asset];
  const negative = amount.startsWith('-');
  const digits = (negative ? amount.slice(1) : amount).padStart(decimals + 1, '0');
  const whole = digits.slice(0, -decimals) || '0';
  const frac = digits.slice(-decimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** Parse a human decimal string ("10.5") into base units, validating shape. */
export function parseStakeAmount(value: string, asset: StakeAsset): string {
  const decimals = STAKE_ASSET_DECIMALS[asset];
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid amount: ${value}`);
  }
  const [, whole, frac = ''] = match;
  if (frac.length > decimals) {
    throw new Error(`Too many decimal places for this asset (max ${decimals})`);
  }
  const base = BigInt(whole!) * 10n ** BigInt(decimals) +
    BigInt(frac.padEnd(decimals, '0') || '0');
  return base.toString();
}

/** GET /wallets/balances response. */
export type WalletBalances = {
  address: string;
  /** Base-unit balances keyed by asset. */
  balances: Record<StakeAsset, string>;
};

/** How a completed match ended, from the viewing player's perspective. */
export type MatchHistoryResult = 'win' | 'loss' | 'void';

export type MatchHistoryEntry = {
  roomId: string;
  gameType: number;
  opponentUsername: string | null;
  result: MatchHistoryResult;
  /** Base-unit stake per player; null for free games. */
  stakeAmount: string | null;
  stakeToken: StakeAsset | null;
  /** Signed base-unit net change for this player (payout − stake, −stake, or 0). */
  prizeDelta: string | null;
  endReason: string | null;
  completedAt: string;
};
