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

## 2026-08-01 — Salvo demo: a second tap on FIRE shoots twice and skips the bot's turn

- **Observed:** two taps on FIRE in demo mode fired two shells and the bot never
  took its turn.
- **Where:** `apps/mobile/src/games/salvo/useLocalSalvo.ts:280-283` (`launch`)
  and `SalvoPlayScreen.tsx:446-448` (the FIRE `Pressable`).
- **Why it's wrong:** `launch` refuses a shot only while one is visibly in
  progress - `s.winner !== null || s.flight !== null || s.driving ||
  shellTimer.current`. Every one of those is false again the moment the shell
  lands: `:321` nulls `shellTimer.current` and the flight clears, but the turn
  does not hand over until the impact ring finishes lingering (`:44`). In that
  gap it is still the player's turn, the button is still `armed`, and a second
  tap passes every guard. `advanceTurn` (`:254`) then runs once per shot, and
  the second hand-over consumes the bot's turn.
  `launch` never checks `s.turn !== shooter`. The bot's path gets that check at
  its call site (`:417`), so only the human-driven path is exposed.
- **Suggested fix:** guard on the turn itself inside `launch` - reject when
  `s.turn !== shooter` - so the settle window cannot be fired into. Keeping the
  button disabled until the hand-over completes is worth doing too, but it
  hides the bug rather than fixing it; the engine should refuse the second shot
  regardless of what the UI allows.
- **Not yet reproduced under a debugger** - the line references are read off
  the code, so confirm the settle window is the actual gap before fixing.
- **Multiplayer looks safe:** `apps/server/src/games/salvo/salvo-match.service.ts:175`
  takes a per-room lock and calls `assertTurn` before resolving, so the same
  double tap online should be rejected. Worth a check while fixing this.

## 2026-08-01 - A refreshed access token never reaches the socket, so an expired one wedges reconnects

- **Where:** `apps/mobile/src/store/websocket.store.ts:46-74`. `connect()` reads
  `accessToken` once (`:50`) and hands `io()` a **static** `auth: { token }`
  object (`:56-59`). It also early-returns while a socket exists (`:47-49`).
- **Why it's wrong:** socket.io-client reuses that captured object on every
  automatic reconnect (reconnection defaults to on), and the server
  re-authenticates each connection in `WebsocketsGateway.handleConnection`. So
  once the access token lapses, any drop - network blip, server redeploy, a long
  spell backgrounded - puts the socket into a reconnect loop that presents the
  same dead token forever. `api/client.ts:onSessionRefreshed` does push the new
  token into the store, and its comment says the socket "carries it on its next
  (re)connect", but a socket.io auto-reconnect is not a `connect()` call - it
  never re-reads the store, and `connect()` would no-op anyway because `socket`
  is still set. HTTP keeps working (the guard refreshes on 401), so the app
  looks healthy while realtime is permanently dead until logout or a restart.
  Note an already-open socket is *not* affected: the gateway authenticates only
  in `handleConnection`, so a live match survives the lapse. The risk is
  entirely at reconnect. Reachability tracks `JWT_EXPIRES_IN` - `.env` currently
  says 30d, but `.env.example` says 2d and `ConfigurationService` documents
  short-lived access tokens as the intent.
- **Suggested fix:** pass `auth` in its callback form, which socket.io-client
  re-evaluates before every connection attempt:
  `auth: cb => cb({ token: useCurrentUserStore.getState().accessToken })`.
  The installed client already types this (`socket.d.ts:36-38`). Optionally also
  force a session refresh when `connect_error` reports an auth failure.
