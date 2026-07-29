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

## 2026-07-29 - GAME_ICONS is dead code, but every new game must feed it

- **Where:** `apps/mobile/src/games/game-icons.ts` (whole file).
- **Why it's wrong:** `GAME_ICONS` is exported but imported nowhere - the
  lobby, history and games rows all use `GAME_TYPE_ICONS` (the lucide glyph
  map in `game-type-labels.ts`) instead. Because it is typed
  `Record<GameType, ImageSourcePropType>`, it is still exhaustive: adding a
  game type breaks the build until someone supplies a PNG that nothing will
  ever render. Adding Salvo required generating
  `assets/games/salvo-icon.png` purely to satisfy it.
- **Suggested fix:** delete `game-icons.ts` and the four (now five) unused
  `assets/games/*-icon.png` files, or wire the artwork into the Demo Games
  cards, which currently draw a lucide glyph over a gradient instead.

## 2026-07-29 - Game containers call goBack() with nothing guaranteed under them

- **Where:** `apps/mobile/src/games/battleship/BattleshipGame.tsx`,
  `ludo/LudoGame.tsx`, `rps/RpsGame.tsx`, `chroma/ChromaGame.tsx` - each has
  `const onExit = () => navigation.goBack();`.
- **Why it's wrong:** if a game route is ever the first route on the root
  stack (a cold start or deep link straight into a match, rather than a push
  from the tabs), `goBack()` is dropped and React Navigation logs "The action
  'GO_BACK' was not handled by any navigator" - the header back button then
  does nothing at all, with no way off the screen. Not reachable today
  because every entry point (`GameLobyScreen`, `DemoGamesScreen`,
  `MainTabsWithGameOverlay`) navigates from inside the tabs, so this is
  latent rather than live. `SalvoGame` now guards it, which leaves the four
  containers inconsistent with each other.
- **Suggested fix:** use the same guard Salvo uses -
  `navigation.canGoBack() ? navigation.goBack() : navigation.reset({ index: 0,
  routes: [{ name: 'MainTabs' }] })` - or hoist it into a shared
  `useMatchExit()` hook that all five containers call.
