# WEBGAMES — browser client plan

Branch: `feature/webgames`. Goal: a plain-React web app at `apps/webgames` with
SIWE (Sign-In With Ethereum) auth, username onboarding, lobby, match history,
stake & wallet view (connected external wallet, no custodial wallet), and
rock-paper-scissors — multiplayer and a local demo vs bot.

## Working rules for the implementer

- **When unsure, check the mobile app first** (`apps/mobile`) — it is the
  reference implementation for every flow in this plan (auth/session handling,
  lobby, RPS hooks, stake screens, onboarding). Mirror its behavior on web.
  If mobile doesn't answer it either, **stop and ask the user** rather than
  guessing.
- **Game/domain logic lives in `packages/core` — use it, never reimplement
  it.** Rules, protocols, socket event names, the turn clock, stake helpers,
  and the `ApiClient` all come from `@gaming-platform/core`. If something
  looks missing from core, ask before duplicating it in webgames.
- **Wallet model**: mobile users get a custodial wallet; web users connect
  their own, so on web the wallet is registered as an **`Imported` wallets
  row at SIWE sign-in** — that row is what links the username/account to the
  wallet for staking, deposits, and lookup. Never call `POST /wallets`
  (custodial creation) from web.

## Headline findings (read before coding)

1. **RPS already exists end-to-end.** It ships as `GameType.TripleCut = 2`:
   core rules/protocol (`packages/core/src/games/rps/`), server gateway + match
   service (`apps/server/src/games/rps/`), deadline sweeper kind `rps-round`,
   settlement wiring, history. **Zero new game code is needed in core or
   server.** Do NOT add a new GameType.
2. **The whole REST surface already has a typed client** —
   `packages/core/src/api/api-client.ts` (`createGameRoom`, `joinGameRoom`,
   `listPendingGameRooms`, `getMatchHistory`, `getRpsRoomState`,
   `getMyActiveGameRoom`, stake-pot calls, auth/refresh with single-flight
   401 retry, `X-App-Version` header). The web app consumes it directly.
3. **SIWE needs no new server dependency.** `viem ^2.54` is already in
   `apps/server` and ships `viem/siwe` (`parseSiweMessage`,
   `validateSiweMessage`, `verifySiweMessage`).
4. **The JWT carries only `{ sub: userId }`** and has a single mint point,
   `AuthenticationService.issueSession` (`authentication.service.ts:168`).
   SIWE reuses it → **no changes** to `guards/jwt-token.guard.ts` or the
   socket auth in `websockets/websockets.gateway.ts:82-115`.
5. **Registering the connected external address as a `wallets` row
   (`type = WalletOrigin.Imported = 1`) makes everything else work for free**:
   stake-pot deposit attribution (`PotEventWatcher.creditDeposits` credits by
   `findWalletByAddress`), withdraw destination (server resolves it from the
   user's wallet), `/users/lookup` visibility, ENS subname minting.
   Without a wallet row, deposits from the external wallet are silently
   dropped and `ChainService.playerAddress` throws a raw 500.
6. **HTTP CORS is open** (`main.ts:25` `app.enableCors()`), game gateways are
   `cors: true` — no server CORS work.
7. `avatarColor` is **client-local only** on mobile
   (`apps/mobile/src/screens/OnboardingScreen.tsx`) — never sent to the API.
   Web does the same (localStorage). No server column.

Reference precedents: `prompts/INTRODUCE_RPS.md`, mobile's
`useMultiplayerRps.ts` / `useDemoRps.ts` / `rps-engine.ts`, and
`apps/web` for the wagmi/viem/connectkit stack (it is a separate standalone
site — do not build on it, only copy its wallet-connect patterns).

---

## Phase 1 — Server: SIWE authentication

All in `apps/server/src/authentication/` unless noted.

### 1.1 Migration: nullable email

`users.email` is `NOT NULL UNIQUE` (`db/migrations/1785000000000-InitialSchema.ts:19-34`).
New migration: drop `NOT NULL` on `users.email` (keep the unique constraint —
Postgres allows multiple NULLs). Update `user.entity.ts` (`email` nullable).
No `provider` column needed: a SIWE user is simply a user with `email = null`
whose wallet row is `Imported`; email users are unchanged.

### 1.2 DbService

`DbService.createUser(email)` (`db/db.service.ts:251`) is the only creation
path. Add `createSiweUser(address)`: in one transaction, insert a user with
`email: null` and a `wallets` row `{ user_id, address, type: WalletOrigin.Imported,
network: WalletNetwork.Ethereum }`. Reuse/mirror `findWalletByAddress`
(case-insensitive — there is an `IDX_wallets_address_lower` index; store the
checksummed address via viem `getAddress`). `wallets.address` is globally
UNIQUE — one platform account per external address, which is the behavior we
want. Do NOT call `fundGasFor` for imported wallets (they pay their own gas).

### 1.3 Endpoints

In `authentication.controller.ts` + `authentication.service.ts`:

- `POST /api/v1/authentication/siwe/nonce` → `{ nonce }`.
  Random 16+ bytes hex (reuse the pattern from refresh-token generation).
  Store in `CacheService` under a new key `siweNonce(nonce)` (add to
  `cache/stores/cache-store.ts` keys), TTL 5 min, value = `'1'`.
  Throttle like `request-token` (5/60s; throttling is prod-only anyway,
  `app.module.ts:31`).
- `POST /api/v1/authentication/siwe/verify` `{ message, signature }` →
  same `AuthSession` payload as `exchange-token` (access + refresh token +
  user), via `issueSession(userId)`.
  Verification steps, in order:
  1. `parseSiweMessage(message)` (`viem/siwe`).
  2. Nonce: exists in cache → **delete it** (single-use) → else 401.
  3. `validateSiweMessage` against configured `domain` and expected
     `chainId` (see 1.4), plus time window.
  4. Signature: if `ChainService` has a public client configured, use viem's
     `verifySiweMessage(client, { message, signature })` (covers EOA +
     ERC-1271/6492 smart accounts). If chain is disabled in this environment,
     fall back to `recoverMessageAddress` + compare (EOA only).
  5. Resolve account: `findWalletByAddress(address)` → that wallet's user;
     else `createSiweUser(address)`. Note this means a user who imported
     their custodial key into MetaMask signs into the *same* account — correct.
- DTOs with class-validator like the existing ones (`@IsString()`,
  length caps on `message`/`signature` to keep payloads sane).

### 1.4 Config

`configuration.service.ts`: add `SIWE_DOMAIN` (the webgames origin's host,
e.g. `play.example.com`; allow `localhost:5173` in dev) and reuse the existing
chain-id config for the expected `chainId`. If `SIWE_DOMAIN` is unset, 503 the
SIWE endpoints (mirror the stake-pot `assertEnabled` pattern).

### 1.5 Things that already work for a SIWE user (verify, don't rewrite)

- `PATCH /users/me/username` — username onboarding, referral code, ENS
  subname mint (uses `wallets[0].address`, which now exists).
- `GET /stake-pot/balances|history|deposit-target`, `POST /stake-pot/withdraw`
  (destination = the imported address), `POST /stake-pot/claim`.
- All of `games/` — keyed off `userId` only.
- `GET /authentication/me`, refresh/logout — untouched.
- Email flows: `requestToken` etc. remain email-only; a null-email user simply
  never uses them.

### 1.6 Server tests / verification

Follow whatever test setup exists in `apps/server` (if none, add a small
manual curl script under `apps/server/scripts/` or verify by hand):
nonce issue → verify happy path (sign with a viem test account), replayed
nonce rejected, wrong domain rejected, bad signature rejected, second login
with same address returns same userId, email user unaffected.

---

## Phase 2 — Web app scaffold: `apps/webgames`

Plain React, **Vite** + TypeScript (no Next). Lives in `apps/*` so npm
workspaces + turbo pick it up automatically.

### 2.0 Design source (mandatory — do this before building any UI)

The UI design is authored in Claude Design. Use the `claude_design` MCP
(`https://api.anthropic.com/v1/design/mcp`, auth via `/design-login`) to
import this project:

https://claude.ai/design/p/13afd813-203c-4945-a7f9-5273815c0321?file=Kombat+Webapp.dc.html

Focus on these files (the whole project is readable):

- `Kombat Webapp.dc.html`

Also read these files the selection imports:

- `_ds/nocturne-f59a6efb-0e05-48e6-89fe-d8a49ce32635/_ds_bundle.js`
- `_ds/nocturne-f59a6efb-0e05-48e6-89fe-d8a49ce32635/styles.css`
- `image-slot.js`
- `support.js`

Implement `Kombat Webapp.dc.html` as the webgames UI: translate its layout,
design tokens (the nocturne `_ds` bundle + `styles.css`), and components into
the React pages of Phases 2–6 rather than inventing a new look. Where the
design and this plan disagree on structure (routes, data), the plan wins;
where they disagree on visuals, the design wins.

- `package.json`: name `@gaming-platform/webgames`; scripts `dev` (vite),
  `build` (tsc -b && vite build), `typecheck` (tsc --noEmit).
  Deps: `react`, `react-dom` (match repo: 19.x), `react-router-dom`,
  `@gaming-platform/core": "*"`, `socket.io-client` (same major as mobile's),
  `wagmi`, `viem`, `connectkit`, `@tanstack/react-query` (wagmi peer),
  `zustand` (mirrors mobile's store style).
- Root `package.json`: add `"webgames": "npm run dev --workspace @gaming-platform/webgames"`.
- `turbo.json` already caches `dist/**` — Vite's default `dist/` outDir is fine.
- Env: `VITE_API_URL` (default the production API like mobile does — see
  commit `a1ea229`), chain settings come from `GET /stake-pot/deposit-target`
  at runtime, not env.
- **Core is consumed via `dist/`** — after any core edit run
  `npm run build --workspace @gaming-platform/core`. (No core edits are
  expected in this project, but Vite must also be able to resolve the
  workspace package — plain ESM import of the built `dist/` works.)

### 2.1 App plumbing

- `src/lib/api.ts` — one `ApiClient` from core. Wire its options: token
  getters/persistence to `localStorage` (access + refresh token), session
  refresh callback, `appVersion` (see "Decisions", D2).
- `src/lib/socket.ts` — socket.io client to the API origin with
  `auth: { token }` (`websockets.gateway.ts:231-237` shows the handshake).
  Reconnect with the *current* access token (re-read on each connect attempt);
  after a token refresh, force a reconnect. Server kicks older sockets for the
  same user — handle the disconnect reason gracefully.
- `src/store/` — zustand stores: session (user, tokens), lobby (mirror
  `apps/mobile/src/store/lobby.store.ts`, including `roomMatchesFilters`
  re-applied to live events).
- Routes (`react-router-dom`): `/signin`, `/onboarding`, `/lobby`,
  `/game/:roomId`, `/demo`, `/history`, `/wallet`. Authed-route guard
  redirects to `/signin` when there is no session; to `/onboarding` when
  `user.username` is null.

## Phase 3 — Web auth + onboarding

- `/signin`: ConnectKit connect button → once connected:
  1. `POST /authentication/siwe/nonce`
  2. `createSiweMessage` (`viem/siwe`) with domain/uri from
     `window.location`, the configured chainId, the nonce
  3. `signMessageAsync` (wagmi)
  4. `POST /authentication/siwe/verify` → store session → route on.
- Mismatch guard: if the wagmi-connected address changes and no longer matches
  the session's wallet address (`GET /wallets`), show a banner and force
  re-auth. Wallet disconnect → keep the API session (it's independent) but
  the wallet page shows "connect wallet".
- `/onboarding`: username + color picker, mirroring mobile's
  `OnboardingScreen` — `PATCH /users/me/username` (regex
  `/^[a-zA-Z0-9_]{3,20}$/`, optional `referredByCode`); color saved to
  localStorage only.

## Phase 4 — Lobby + history

- `/lobby`:
  - Initial list: `api.listPendingGameRooms({ gameTypes: [GameType.TripleCut] })`.
  - Live: `channel:join { channel: LOBBY_CHANNEL }` + `LOBBY_EVENTS`
    (`room-added|room-removed|room-updated` from
    `packages/core/src/games/game-room.types.ts`), filtered client-side to
    TripleCut like mobile does.
  - Create room: fixed to TripleCut; optional stake (token + preset amount —
    presets/validation live server-side in `stakes.service.ts`; surface the
    same presets mobile shows, disable staking when `GET /stake-pot/balances`
    is 503/insufficient).
  - Join from list, join by 6-char code (`getGameRoomByCode`), "my active
    room" banner via `getMyActiveGameRoom` → resume into `/game/:roomId`.
  - Leave/close pending room (`leaveGameRoom` / `DELETE /games/rooms/:id`).
  - 2-player rooms start on join — on `ROOM_EVENTS.opponentJoined` /
    `game:started`, navigate both players into the room. No start-early
    button (that's multi-seat only).
- `/history`: `api.getMatchHistory` (`MatchHistoryEntry`: result, prizeDelta,
  endReason, gameType) with paging; plus `GET /users/me/stats` for the
  lifetime header.

## Phase 5 — RPS game (multiplayer + demo)

Port the mobile pattern, not the pixels:

- Define the same engine seam as mobile
  (`apps/mobile/src/games/rps/rps-engine.ts` → `RpsEngine`) so one
  `<RpsBoard engine={...}>` component serves both modes.
- **Multiplayer hook** — port the logic of
  `apps/mobile/src/games/rps/useMultiplayerRps.ts` (263 lines):
  resume state via `api.getRpsRoomState(roomId)`, join `game:<roomId>`
  channel, emit `RPS_EVENTS.enter|lock|forfeit`, handle
  `locked|reveal|presence|ended|error`, round clock from the protocol's
  `TURN_SECONDS`, win target from core `WIN_TARGET`. Timeouts are enforced
  server-side by the sweeper — the client only renders the countdown.
- **Demo hook** — port `apps/mobile/src/games/rps/useDemoRps.ts` (140 lines):
  core `resolveRound` + `randomMove()` from
  `packages/core/src/games/rps/rps.rules.ts`, no server involved.
- `/demo` page: "free practice vs bot" entry, mirroring mobile's
  `DemoGamesScreen` but RPS-only for now.
- Forfeit + presence UI (opponent disconnected indicator), end screen with
  result and settlement info for staked matches.

## Phase 6 — Stake & wallet page

`/wallet` shows the **connected wallet** (no custodial wallet creation —
never call `POST /wallets` from web):

- Address (wagmi `useAccount`) + the session's registered address, ENS name
  from `GET /users/me`.
- Pot balances: `GET /stake-pot/balances`, kept live via the
  `stakepot:balance` socket event (full snapshot,
  `packages/core/src/games/stake-pot.types.ts`).
- Deposit: `GET /stake-pot/deposit-target` → `{ contract, chainId, tokens }` →
  wagmi `writeContract` (ERC-20 approve + `StakePot` stake; the ABI lives at
  `apps/server/src/stake-pot/stake-pot.abi.ts` — copy the minimal client-side
  ABI into webgames, and crib the flow from `apps/web/src/components/stake/StakeScreen.tsx`).
  Credit lands asynchronously via `PotEventWatcher` — show "pending until
  credited" and rely on the `stakepot:balance` push.
- Withdraw: `POST /stake-pot/withdraw` `{ asset, amount }` — destination is
  resolved server-side to the user's (imported) wallet address.
- Pot history: `GET /stake-pot/history`.
- One-time `POST /stake-pot/claim` (KOMBAT welcome grant) button if unclaimed.
- Handle the 503 "stake pot disabled" state for local dev without chain env.

## Phase 7 — Verification

1. `npm run typecheck` at the root (builds core, checks all workspaces incl.
   webgames).
2. Server up (`npm run server`), webgames dev up, mobile untouched:
   - SIWE happy path in browser (two browsers / two wallets for a full match).
   - Full RPS match: create → join → best-of rounds → history entry appears
     for both users; a round timeout (wait out `TURN_SECONDS`) resolves via
     the sweeper; forfeit path.
   - Demo game fully offline from the server.
   - Staked match end-to-end only if local chain env is configured; otherwise
     verify the disabled/503 states render correctly.
3. Email login on mobile still works (regression check on the migration).

---

## Decisions taken (flag to the user if you disagree)

- **D1 — Identity model**: nullable `users.email` + `Imported` wallet row; no
  `provider` column. Least schema churn, and the wallet row is what makes
  deposits/withdrawals/lookup work.
- **D2 — `SupportedVersionGuard`**: it reads `X-App-Version` (missing →
  `0.0.0` → 426 once `minAppVersion` is set) and guards room
  create/join/start/leave + stake-pot withdraw/claim/deposit-target. The web
  app is always the latest deploy, so gating it by mobile version numbers is
  wrong. Change the guard to skip when `X-App-Platform: web` is sent
  (`maintenance/supported-version.guard.ts`), and have webgames' ApiClient
  send that header. Mobile never sends it, so mobile gating is unchanged.
- **D3 — Colors stay client-local** (localStorage), matching mobile. A server
  column is a separate future task if cross-device colors are ever wanted.
- **D4 — No new GameType.** Web ships TripleCut (RPS) only; the lobby filters
  to it. Adding more games to web later is client-only work per game.
- **D5 — App location**: `apps/webgames` (not repo-root `webgames/`) so the
  existing `apps/*` workspace glob and turbo config apply untouched.

## Gotchas (from code archaeology — do not relearn these the hard way)

- Two independent JWT verify sites exist (`jwt-token.guard.ts:28`,
  `websockets.gateway.ts:91`). This plan changes **no claims**, so touch
  neither.
- `apps/web` is a standalone marketing/admin site with its own Postgres —
  never add platform-server code paths for it, and don't confuse it with
  `apps/webgames`.
- Every gameplay mutation must stay under the per-room cache lock — already
  true for RPS (`rps-match.service.ts` `locked()`); web adds no server
  mutations.
- Salvo's launch bugs to not repeat in the web client: read the 2-player seat
  (`opponent_id`), not the multi-seat array (commit `071f8ce`); and the
  joiner must be recognized as a participant immediately after join
  (commit `6e48907`).
- The socket server kicks previous sockets for a user on connect — a second
  browser tab will fight the first; surface it, don't loop reconnects.
- `stake-pot` module 503s entirely without chain env — every wallet-page
  surface needs a disabled state for local dev.
