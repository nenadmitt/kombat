# MOBILE - bugs and inconsistencies

Entry format: date, one-line summary, location, why it's wrong, suggested
fix. Remove an entry in the same change that fixes it.

## 2026-07-17 - Ludo captures stat resets on reconnect

- **Where:** `apps/mobile/src/games/ludo/useMultiplayerLudo.ts`
  (`myCaptures` accumulates from pushes only).
- **Why it's wrong:** the REST snapshot has no capture history, so a
  mid-match reconnect zeroes the result-screen CAPTURES stat.
- **Suggested fix:** track per-player capture counts in the server match
  state and expose them in the snapshot + moved payloads (same pattern as
  battleship's volley stats).

## 2026-07-25 - Withdrawal stays "pending" though it's confirmed on-chain

- **Where:** `apps/mobile/src/store/transactions.store.ts` (`step()` poll
  loop, ~L116-145) + `apps/mobile/src/components/wallet/TransactionModal.tsx`.
- **Why it's wrong:** a sent withdrawal that is mined + confirmed (verified
  on Etherscan) never flips to `success` in the tx sheet - it sits on
  "pending". `step()` only marks success when
  `getTransactionConfirmations({ hash })` >= REQUIRED_CONFIRMATIONS, so if
  the polled RPC (`getPublicClient`) lags behind or never indexes the hash
  (different/stale endpoint than Etherscan), confirmations stays 0 and the
  loop polls forever. The `catch` also swallows every error and just keeps
  polling, so there's no timeout/failure surface.
- **Suggested fix:** poll `getTransactionReceipt` directly (receipt present
  with status 'success' => done; don't gate solely on
  getTransactionConfirmations), add a max-attempts/backoff cap that surfaces
  a timeout state, and confirm `getPublicClient` uses the same RPC the tx was
  broadcast on. Also sanity-check REQUIRED_CONFIRMATIONS isn't higher than
  the RPC reports promptly.
