import { STAKE_ASSETS, StakeAsset } from './stake.types';

export type StakePotAmounts = Record<StakeAsset, string>;

export type StakePotBalances = {
  available: StakePotAmounts;
  locked: StakePotAmounts;
  pendingWithdrawals: StakePotAmounts;
};

/** Stored server-side as smallint: never renumber. */
export enum StakeLedgerKind {
  Deposit = 0,
  Hold = 1,
  /** Releases both players' locked stakes, the winner's included. */
  Capture = 2,
  Release = 3,
  Prize = 4,
  Fee = 5,
  WithdrawalRequest = 6,
  WithdrawalRefund = 7,
  /** Recorded from the contract's `Withdrawn` event: the owner sweeps on-chain without the server. */
  FeeSweep = 8,
}

/** Stored server-side as smallint: never renumber. */
export enum StakeWithdrawalStatus {
  Pending = 0,
  Sent = 1,
  Confirmed = 2,
  Failed = 3,
}

export type StakePotHistoryEntry = {
  id: string;
  asset: StakeAsset;
  kind: StakeLedgerKind;
  /** Signed change to `available`. */
  amount: string;
  roomId: string | null;
  txHash: string | null;
  createdAt: string;
};

export type StakePotFeeSummary = {
  asset: StakeAsset;
  symbol: string;
  accrued: string;
  swept: string;
  claimable: string;
};

export type StakePotWithdrawalResponse = {
  withdrawalId: string;
  status: StakeWithdrawalStatus;
};

export type StakePotDepositTarget = {
  contract: string;
  chainId: number;
  tokens: { asset: StakeAsset; symbol: string; address: string }[];
};

export const STAKE_POT_EVENTS = {
  /** Payload: StakePotBalances, a full snapshot rather than a delta. */
  balance: 'stakepot:balance',
} as const;

export function emptyStakePotAmounts(): StakePotAmounts {
  return Object.fromEntries(
    STAKE_ASSETS.map(asset => [asset, '0']),
  ) as StakePotAmounts;
}

export function emptyStakePotBalances(): StakePotBalances {
  return {
    available: emptyStakePotAmounts(),
    locked: emptyStakePotAmounts(),
    pendingWithdrawals: emptyStakePotAmounts(),
  };
}
