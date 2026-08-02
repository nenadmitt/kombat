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

## 2026-07-31 - Wallet balance-hero helpers orphaned by the wallet/stake-pot split

- **Summary:** the redesigned wallet tab drops the gradient total-balance hero
  (sparkline, week-change pill, allocation bar), leaving three exports with no
  remaining caller.
- **Where:** `src/components/Sparkline.tsx` (whole component),
  `src/wallet/market-mock.ts` (`MOCK_BALANCE_SPARK`, `MOCK_WEEK_CHANGE` -
  `MOCK_TRENDS` is still used by the asset rows), and `totalUsd` in
  `src/store/walletBalances.store.ts:132`.
- **Why it's wrong:** dead code that still typechecks and ships in the bundle,
  and `totalUsd` reads as the wallet's live USD total when nothing calls it.
- **Suggested fix:** delete all three if the balance hero is not coming back;
  otherwise leave them and note the intent. Left in place because the call is
  the design's, not a code question.

## 2026-08-02 - Shared UI primitives use raw pixel spacing, not the scale

- **Summary:** four `components/ui` primitives hardcode padding/gap/radius
  values that are not tokens from `spacing`/`radius` in `theme/colors.ts`,
  which every screen is required to use.
- **Where:** `src/components/ui/Chip.tsx:75` (`gap: 5`) and `:79`
  (`paddingVertical: 5`); `src/components/ui/AddressPill.tsx:39`
  (`paddingVertical: 7`); `src/components/ui/BottomSheet.tsx:111-112`
  (`borderTopLeftRadius: 30`, `borderTopRightRadius: 30`), `:123`
  (`borderRadius: 3`), `:155` (`borderRadius: 16`);
  `src/components/wallet/ChainSelector.tsx:14` (`const GAP = 13`).
- **Why it's wrong:** `apps/mobile/CLAUDE.md` rule 0 makes the scale
  non-negotiable and names 7, 9, 11, 13 as wrong even when a design says so.
  Screens that follow the rule still inherit off-scale insets through these
  primitives, so the grep the rule prescribes passes while the rendered
  spacing is still off.
- **Suggested fix:** `gap: 5` -> `spacing.xxs`, `paddingVertical: 5|7` ->
  `spacing.xxs`, sheet corners 30 -> `radius.xl`, `borderRadius: 16` ->
  `radius.md`, drag handle 3 -> `radius.sm`, `GAP = 13` -> `spacing.sm`.
  Each shifts pixels, so it needs a screenshot pass rather than a blind
  sweep.

## 2026-08-02 - `textFaint` is invisible on every surface it is used on

- **Summary:** `colors.textFaint` (`#4a4b57`) contrasts 2.04:1 against the app
  background and 1.76:1 against `surface`. WCAG AA wants 4.5:1 for body text
  and 3:1 for non-text; the token clears neither anywhere it is used.
- **Where:** `src/theme/colors.ts:109` (the token). Its doc comment names
  placeholders, fine print and disabled text as the intended uses.
- **Why it's wrong:** placeholder text is the label for an empty input, so a
  user who cannot read it cannot tell what the field wants. `textMuted` was
  lightened to `#8a8b9a` for exactly this reason and `textFaint` was left
  behind, so the two now sit far apart with nothing in between.
- **Suggested fix:** lighten to roughly `#6c6d79` (4.5:1 on the background,
  still a clear step below `textMuted`), then re-check the screens that use it
  for placeholders. Not done here because it lands on inputs across the whole
  app and wants a screenshot pass.
