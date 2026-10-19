/** Stored server-side as smallint: never renumber. */
export enum StakeAsset {
  Native = 0, // wallet/gas only, never stakeable
  Kombat = 1,
  Usdc = 2,
  Usdt = 3,
  Dai = 4,
}

export const STAKE_ASSETS: StakeAsset[] = [
  StakeAsset.Native,
  StakeAsset.Kombat,
  StakeAsset.Usdc,
  StakeAsset.Usdt,
  StakeAsset.Dai,
];

export const STAKEABLE_ASSETS: StakeAsset[] = [
  StakeAsset.Kombat,
  StakeAsset.Usdc,
  StakeAsset.Usdt,
  StakeAsset.Dai,
];

export function isStakeableAsset(asset: StakeAsset): boolean {
  return STAKEABLE_ASSETS.includes(asset);
}

/** The stablecoins, which the platform treats as interchangeable 1:1. */
export const STABLE_ASSETS: StakeAsset[] = [
  StakeAsset.Usdc,
  StakeAsset.Usdt,
  StakeAsset.Dai,
];

export function isStableAsset(asset: StakeAsset): boolean {
  return STABLE_ASSETS.includes(asset);
}

export const STAKE_PRESETS = [1, 5, 10, 25, 50, 100, 250, 500] as const;

export const STAKE_ASSET_DECIMALS: Record<StakeAsset, number> = {
  [StakeAsset.Native]: 18,
  [StakeAsset.Kombat]: 18,
  [StakeAsset.Usdc]: 6,
  [StakeAsset.Usdt]: 6,
  [StakeAsset.Dai]: 18,
};

export const STAKE_ASSET_SYMBOLS: Record<StakeAsset, string> = {
  [StakeAsset.Native]: 'ETH',
  [StakeAsset.Kombat]: 'KOMBAT',
  [StakeAsset.Usdc]: 'USDC',
  [StakeAsset.Usdt]: 'USDT',
  [StakeAsset.Dai]: 'DAI',
};

export function isPresetStakeAmount(asset: StakeAsset, amount: string): boolean {
  if (!/^\d+$/.test(amount)) {
    return false;
  }
  const value = BigInt(amount);
  const unit = 10n ** BigInt(STAKE_ASSET_DECIMALS[asset]);
  return STAKE_PRESETS.some(preset => value === BigInt(preset) * unit);
}

/** Settlement lifecycle for a staked room. Free rooms have no row. */
export enum SettlementStatus {
  Funding = 0,
  Funded = 1,
  SettlePending = 2,
  Settled = 3,
  VoidPending = 4,
  Voided = 5,
  Failed = 6,
}

export const STAKE_ASSET_MIN: Record<StakeAsset, string> = {
  [StakeAsset.Native]: '1000000000000000', // 0.001 ETH
  [StakeAsset.Kombat]: '1000000000000000000', // 1 KOMBAT
  [StakeAsset.Usdc]: '1000000', // 1 USDC
  [StakeAsset.Usdt]: '1000000', // 1 USDT
  [StakeAsset.Dai]: '1000000000000000000', // 1 DAI
};

export const STAKE_EVENTS = {
  funding: 'stake:funding',
  funded: 'stake:funded',
  failed: 'stake:failed',
} as const;

export function formatStakeAmount(amount: string, asset: StakeAsset): string {
  const decimals = STAKE_ASSET_DECIMALS[asset];
  const negative = amount.startsWith('-');
  const digits = (negative ? amount.slice(1) : amount).padStart(decimals + 1, '0');
  const whole = digits.slice(0, -decimals) || '0';
  const frac = digits.slice(-decimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

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

/** Throws rather than truncate when the target asset can't represent the value. */
export function convertStakeAmount(
  amount: string,
  from: StakeAsset,
  to: StakeAsset,
): string {
  if (!/^\d+$/.test(amount)) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  const value = BigInt(amount);
  if (from === to) {
    return value.toString();
  }
  const shift = STAKE_ASSET_DECIMALS[to] - STAKE_ASSET_DECIMALS[from];
  if (shift >= 0) {
    return (value * 10n ** BigInt(shift)).toString();
  }
  const divisor = 10n ** BigInt(-shift);
  if (value % divisor !== 0n) {
    throw new Error(
      `${amount} ${STAKE_ASSET_SYMBOLS[from]} has more precision than ${STAKE_ASSET_SYMBOLS[to]} can hold`,
    );
  }
  return (value / divisor).toString();
}

export type WalletBalances = {
  address: string;
  balances: Record<StakeAsset, string>;
};

export type MatchHistoryResult = 'win' | 'loss' | 'void';

export type MatchHistoryEntry = {
  roomId: string;
  gameType: number;
  /** Kept for older clients; prefer `opponentUsernames`. */
  opponentUsername: string | null;
  opponentUsernames: string[];
  result: MatchHistoryResult;
  stakeAmount: string | null;
  stakeToken: StakeAsset | null;
  /** Signed net change: payout - stake, -stake, or 0. */
  prizeDelta: string | null;
  endReason: string | null;
  completedAt: string;
};
