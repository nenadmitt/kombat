# StakePot: leftover code to clean up after cutover

Do NOT touch any of this while `STAKING_MODE=escrow` still serves traffic or
while `stake_escrows` has non-terminal rows (`status IN (0,2,4)`). Removal is
its own PR, after the drain described in STAKEPOT_PLAN.md §5.

## Escrow code that becomes dead once pot mode is permanent

- `apps/server/src/games/stakes/stake.sweeper.ts` — entire file. Pot-mode
  rooms never enter `Funding`/`SettlePending`/`VoidPending`, so the sweeper
  has no work; delete it and its registration in `games.module.ts`.
- `apps/server/src/games/stakes/stakes.service.ts` — the escrow branch:
  `fundRoom`, `escrowStakes`, `escrowNativeStakes`, `handleFundingFailure`
  (escrow variant), `settleEscrow`, `voidEscrow`, `recordSweepFailure`, the
  funding lock (`fundingLockKey`, `FUNDING_LOCK_TTL_MS`), and
  `NATIVE_GAS_HEADROOM`. Also collapse the `STAKING_MODE` branches.
- `apps/server/src/chain/chain.service.ts` — escrow writes/reads:
  `openWithApprovals`, `openWithPermits`, `createMatch`, `fundNativeAs`,
  `settleStake`, `voidStake`, `getStakeState`, `isFunded`, `getFeeBps`,
  `signPermitAs` (server-side permits die with the escrow; mobile signs its
  own for `stakeWithPermit`), `ensureStakeApproval`,
  `prepareWalletForStaking`, `matchIdFor` (if the pot-mode escrow row keeps
  using it, move it instead). Keep: clients, operator account/lock,
  `getBalances`, `playerAddress`, gas dusting.
- `apps/server/src/chain/escrow.abi.ts` — `ESCROW_ABI`,
  `OnChainStakeState`; keep `ERC20_ABI` (move it somewhere neutral).
- `apps/server/src/wallets/wallets.service.ts` — the
  `prepareWalletForStaking` fire-and-forget in `createWallet` (replaced by a
  plain gas dust in pot mode per plan Phase 3).
- Config: `ESCROW_ADDRESS`, `ESCROW_APPROVAL_AMOUNT` in
  `configuration.service.ts`; the `STAKING_MODE` flag itself once escrow is
  gone.
- `packages/core` — `EscrowStatus` values that stop occurring for new rows
  (`Funding`, `SettlePending`, `VoidPending`) stay for historical data;
  just update the doc comment. The 7-day `withdrawStake` note in the
  `Failed` comment becomes wrong once MatchEscrow is retired.
- `apps/evm-contracts/src/MatchEscrow.sol` + `test/MatchEscrow.t.sol` +
  `script/DeployMatchEscrow.s.sol` — archive/retire after the deployed
  escrow is drained (call `withdrawFeePot`, wait out `WITHDRAW_DELAY` on any
  stragglers, then abandon the deployment).
- `apps/mobile/src/components/ui/StakeFundingOverlay.tsx` — after cutover
  the funding→funded gap is one server roundtrip; either delete the overlay
  (and the `stake:funding` handling in `game.store.ts`) or keep it as a
  spinner-free transition. Decide then.

## Left behind by the implementation (safe to remove any time)

- `StakePotChainService.isPaused()` and
  `StakePotChainService.remainingDailyAllowance` (in the ABI) are read helpers
  nothing calls yet - intended for an admin health view. Drop them if that never
  lands.

## Pre-existing working-tree leftovers (not created by this task)

Untracked files that were already in the working tree before the
`feat/stake-pot` branch was created and carried over from
`feat/salvo-damage-model`; they are analysis docs, not code:

- `loby_improvement.md`
- `staking_improvement.md` (referenced by STAKEPOT_PLAN.md — commit or keep)

Decide whether to commit them (on which branch) or move them out of the repo.

## Still present, now inert (creator side)

The joiner's funding overlay is gone - a staked join returns only once the holds
are in place, so there is nothing to wait for. The creator's copy of it is still
wired up and now flashes for a single tick:

- `game.store`'s `securingStakes` / `setSecuringStakes`
- the `STAKE_EVENTS.funding` / `funded` subscription in
  `navigation/MainTabsWithGameOverlay.tsx`
- the `showSecuring` branch and `StakeFundingCard` in
  `games/WaitingForPlayersPopup.tsx`, plus
  `components/ui/StakeFundingOverlay.tsx` itself

Left alone on purpose: it touches the iOS modal-presentation code that has
caused four separate touch-dead bugs, so it wants its own change rather than
riding along with a fix.
