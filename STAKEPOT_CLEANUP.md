# StakePot cleanup: what was removed, and what survived

Done on `feat/stake-pot` once the cutover gate was clear (`STAKING_MODE=pot`
serving traffic, zero non-terminal `stake_escrows` rows). Pot mode is now the
only staking path.

## Removed

- **`MatchEscrow.sol`**, its 39 Foundry tests and `DeployMatchEscrow.s.sol`.
  The deployed contract is abandoned; its `broadcast/` record is kept as
  deployment history, and the residual fee pot is 4 KC of the superseded
  KombatCoin.
- **The escrow half of `StakesService`**: `fundRoom`, `escrowStakes`,
  `escrowNativeStakes`, `handleFundingFailure`, `settleEscrow`, `voidEscrow`,
  `recordSweepFailure`, the per-room funding lock and `NATIVE_GAS_HEADROOM`.
  The `STAKING_MODE` branches are collapsed, so there is one code path.
- **Most of `ChainService`**: every escrow read and write, plus `signPermitAs`,
  `ensureStakeApproval`, `prepareWalletForStaking` and `getAllowance`. What is
  left is `getBalances` for the wallet screen and `fundGasFor`.
- **`escrow.abi.ts`** - `ESCROW_ABI` and `OnChainStakeState` are gone;
  `ERC20_ABI` moved to `chain/erc20.abi.ts`.
- **Config**: `ESCROW_ADDRESS`, `ESCROW_APPROVAL_AMOUNT`, `STAKING_MODE`.
- **The funding overlay**, end to end: `StakeFundingOverlay.tsx`,
  `game.store`'s `isSecuringStakes`/`setSecuringStakes`, the popup's
  `showSecuring` branch, and the `stake:funding`/`stake:funded` subscriptions.
  A staked join now returns only once the holds are in place, so there was
  nothing left to wait for.

A side effect worth knowing: **the server no longer decrypts a player's private
key anywhere.** Deposits are signed on the device and withdrawals by the
operator, so `ChainService` dropped `WalletCryptoModule` entirely. The
encrypted keys still exist in `wallets` as the user's recovery artifact.

## Kept, against what this doc originally said

- **`StakeSweeper`**, reduced to recovering rooms orphaned in `Funding`. The
  earlier claim that pot rooms never sit in `Funding` was wrong: a crash
  between writing the escrow row and taking the hold leaves the room
  unplayable, and a crash the other way round leaves holds locked with nothing
  to release them. Small window, bad enough consequence to insure against.
- **`stake_escrows` rows and the `EscrowStatus` enum.** Pot mode still writes a
  row per staked room because `assertRoomPlayable`, the match history and
  `findStakeNetByTokenForUser` all read it. The `Funding`, `SettlePending` and
  `VoidPending` values still occur (the first briefly, the others only on
  historical rows).
- **The `stake:funding` / `stake:funded` broadcasts.** No client consumes them
  now, but they are a cheap, accurate lifecycle signal and the natural hook for
  a future web client.

## Still open

- **No fee sweep.** Fees accrue to `PLATFORM_ACCOUNT_ID` in the ledger and
  there is no way to move them out: `POST /stake-pot/withdraw` resolves the
  destination from the caller's own wallet, and the platform account is not a
  user. `requestWithdrawal(PLATFORM_ACCOUNT_ID, …)` already does the right
  thing, so this is an admin endpoint behind `AdminTokenGuard`, not new
  machinery.
- `StakePotChainService.isPaused()` and `remainingDailyAllowance` (in the ABI)
  are unused reads, intended for an admin health view. Drop them if that never
  lands.
- `loby_improvement.md` is untracked and predates this branch - not this
  work's to commit.
