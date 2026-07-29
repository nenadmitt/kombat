/**
 * Stake pot (pooled staking) - shared between server and clients.
 *
 * Players deposit once into the StakePot contract; from then on every staked
 * match moves money only in the server's ledger. Amounts cross the wire as
 * base-unit decimal strings, exactly like the per-match stake amounts in
 * `stake.types.ts` - format them with `formatStakeAmount`.
 */

import { StakeAsset } from './stake.types';

/** Base-unit amounts keyed by asset, as decimal strings. */
export type StakePotAmounts = Record<StakeAsset, string>;

/** GET /stake-pot/balances response. */
export type StakePotBalances = {
  /** Spendable: what a new staked match may be entered with. */
  available: StakePotAmounts;
  /** Held by matches currently in progress - not spendable, not lost. */
  locked: StakePotAmounts;
  /** Requested withdrawals that have not confirmed on-chain yet. */
  pendingWithdrawals: StakePotAmounts;
};

/** Why a ledger entry exists. Stored server-side as smallint. */
export enum StakeLedgerKind {
  /** Credited from an on-chain `Staked` event. */
  Deposit = 0,
  /** Match funding: available → locked. */
  Hold = 1,
  /** Match settled: the loser's (and winner's) locked stake leaves the hold. */
  Capture = 2,
  /** Match voided: locked → available. */
  Release = 3,
  /** Winner's payout (pot − fee). */
  Prize = 4,
  /** Platform fee slice, credited to the platform account. */
  Fee = 5,
  /** Withdrawal requested: debits available. */
  WithdrawalRequest = 6,
  /** Withdrawal failed terminally: the debit is given back. */
  WithdrawalRefund = 7,
}

/** Lifecycle of a withdrawal request. Stored server-side as smallint. */
export enum StakeWithdrawalStatus {
  Pending = 0,
  Sent = 1,
  Confirmed = 2,
  /** Terminal, and the funds have been returned to the pot balance. */
  Failed = 3,
}

/** One row of GET /stake-pot/history. */
export type StakePotHistoryEntry = {
  id: string;
  asset: StakeAsset;
  kind: StakeLedgerKind;
  /** Signed base-unit change to `available` (negative for debits). */
  amount: string;
  /** Set for match-related entries (Hold / Capture / Release / Prize / Fee). */
  roomId: string | null;
  /** Set for deposits. */
  txHash: string | null;
  createdAt: string;
};

/** POST /stake-pot/withdraw response. */
export type StakePotWithdrawalResponse = {
  withdrawalId: string;
  status: StakeWithdrawalStatus;
};

/**
 * GET /stake-pot/deposit-target. Clients sign deposits themselves, so they
 * need the pot address and the token address per asset from the server rather
 * than hardcoding a second copy of the registry.
 */
export type StakePotDepositTarget = {
  contract: string;
  chainId: number;
  tokens: { asset: StakeAsset; symbol: string; address: string }[];
};

/** Socket events pushed to a user's own room as their pot balance moves. */
export const STAKE_POT_EVENTS = {
  /** Payload: StakePotBalances - a full snapshot, not a delta. */
  balance: 'stakepot:balance',
} as const;

/** Zero for every asset - the starting point for a user with no pot yet. */
export function emptyStakePotAmounts(): StakePotAmounts {
  return {
    [StakeAsset.Native]: '0',
    [StakeAsset.Kombat]: '0',
    [StakeAsset.Usdc]: '0',
  };
}

export function emptyStakePotBalances(): StakePotBalances {
  return {
    available: emptyStakePotAmounts(),
    locked: emptyStakePotAmounts(),
    pendingWithdrawals: emptyStakePotAmounts(),
  };
}
