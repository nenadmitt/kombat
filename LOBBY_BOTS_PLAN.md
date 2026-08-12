# Lobby Bots — external bot runner (`apps/lobby-bots`)

## Context

The lobby often looks empty, so real players create a room, see no action, and leave. This adds a pool of **~100 provisioned bot accounts** with human-looking usernames, of which **5-10 are active at any moment** (rotated so regulars keep seeing different names). Active bots **join human rooms that sit unanswered for 10-25s**, **create rooms when the lobby is thin**, and **play matches to completion** (Battleship + Ludo) using the bot policies already in `packages/core`. Staked play is **KOMBAT-only behind a config flag, default off**.

Decisions already made by the user: ~100 real accounts (not renaming), separate runner process (not in-server), staked KOMBAT allowed behind config, join-after-10-15s + create-when-thin behavior. Prior investigation: `bugs-and-improvements/bot-accounts-lobby-fill.md` (its join-race concern is since fixed via conditional UPDATE; its `is_bot` column is NOT needed — the runner knows its own userIds).

**No server changes. One one-line core change.** Everything runs through existing public endpoints as a real client: the framework-free `ApiClient` (`packages/core/src/api/api-client.ts`) + `socket.io-client`, patterned on the e2e harness (`apps/server/test/harness/actor.ts`).

## Architecture

One Node process (new workspace `@gaming-platform/lobby-bots`; root `workspaces: ["apps/*"]` picks it up automatically). Each active bot = one ApiClient + one socket + a state machine (`activating → idle → hosting|joining → playing → cooldown → idle`, honoring `retiring`). A central orchestrator owns the shared lobby model, rotation, and join/create policies; per-game drivers play matches.

```
main.ts ─ config ─ bot store (state/bots.json, gitignored, chmod 600)
   │
Orchestrator
   ├─ Rotation (which 5-10 of ~100 are live; staggered 30-90min sessions, LRU pick)
   ├─ LobbyModel (lobby socket events + 20-30s REST poll reconcile; room ages;
   │              bot rooms classified by creatorUserId ∈ own-account set)
   ├─ JoinPolicy (human Pending room aged past its sampled 10-25s delay →
   │              in-memory claim map → one idle bot joins; 409 = release+blacklist)
   ├─ CreatePolicy (humanPendingRooms < floor && botHosted < cap → idle bot hosts;
   │                hosted-room TTL 3-8min then closeGameRoom)
   └─ BotRuntime × N ─ GameDriver (battleship / ludo) + pacing (jitter, deadline-clamped)
```

## Step 0 — Core prerequisite (verified)

`packages/core/src/games/battleship/battleship.bot.ts:54` — export `chooseAim(fleet, shots)` and the `Aim` type (line 20); both are currently module-private. `chooseAim` is pure hunt/target aiming; the networked bot feeds it a **synthetic fleet** built only from `revealedOpponentShips` (from `ShotPayload.sunkShips` / room state), which gives exactly-right behavior (unsunk hits stay "active"). Rebuild core after (`npm run build --workspace @gaming-platform/core` — core is consumed via `dist/`).

## Step 1 — Workspace

```
apps/lobby-bots/
  package.json   deps: @gaming-platform/core, socket.io-client ^4.8.3, viem ^2.55.10 (match webgames versions)
                 devDeps: typescript, tsx, @types/node
                 scripts: build(tsc), typecheck(tsc --noEmit), start(node dist/main.js),
                          dev(tsx src/main.ts), provision(tsx src/provision/provision.ts)
  tsconfig.json  .gitignore (state/)  state/
  src/
    main.ts  config.ts  logger.ts
    state/bot-store.ts        provision/name-pool.ts  provision/provision.ts
    auth/login.ts             net/socket.ts
    orchestrator/{orchestrator,rotation,lobby-model,join-policy,create-policy}.ts
    bot/{bot-runtime,pacing}.ts   stakes/staking.ts
    drivers/{driver,battleship.driver,ludo.driver}.ts
  test/                       node:test unit tests
```

Root `package.json` scripts (existing style): `"bots": "npm run dev --workspace @gaming-platform/lobby-bots"`, `"bots:provision": "npm run provision --workspace @gaming-platform/lobby-bots --"`. `turbo.json` unchanged.

## Step 2 — Config (`src/config.ts`)

Env-first (`process.loadEnvFile()` on `apps/lobby-bots/.env`, no dotenv dep) + optional `BOTS_CONFIG_FILE` JSON overlay; defaults for everything. Keys: `BOTS_SERVER_URL` (localhost:3000), `BOTS_STATE_FILE`, `BOTS_AUTH_MODE` (siwe|test-otp), `BOTS_SIWE_DOMAIN/URI` + `BOTS_CHAIN_ID`, `BOTS_ACTIVE_MIN/MAX` (5/10), `BOTS_SESSION_MIN/MAX_MIN` (30/90), `BOTS_JOIN_DELAY_MS_MIN/MAX` (10000/25000), `BOTS_MIN_LOBBY_ROOMS` (2), `BOTS_MAX_HOSTED_ROOMS` (2), `BOTS_HOSTED_ROOM_TTL_MS_MIN/MAX` (3-8min), `BOTS_GAME_MIX` (NavalBattle:0.6,Ludo:0.4), `BOTS_STAKES_ENABLED` (false), `BOTS_STAKE_AMOUNTS` (1,5 — validated ⊂ `STAKE_PRESETS`), `BOTS_STAKED_SHARE` (0.2), pacing min/max pairs (bship setup 5-15s, shot 2.5-6s; ludo roll 1.3-3s, move 0.9-2.5s), `BOTS_SHUTDOWN_MODE` (forfeit|drain), `BOTS_LOG_LEVEL`. Ship an `.env.example`.

## Step 3 — Identity store + provisioning

- **Store**: JSON array `{botId, username, userId, privateKey?, email?, provisionedAt, welcomeBonusClaimedAt?}`; atomic write (tmp+rename), never logged. Prod: this file is a secret (SIWE keys grant the accounts); back it up with other prod secrets.
- **Name pool** (`provision/name-pool.ts`): ~120 checked-in human-looking handles matching `^[a-zA-Z0-9_]{3,20}$` (mixed styles: `mike_p`, `Jenna94`, `oldwolf77`…). No faker dep.
- **CLI** `npm run bots:provision -- --count 100` — idempotent (skips names already in store), sequential with 250-500ms jitter, persists after each account:
  1. **siwe mode** (prod-capable, needs server `SIWE_DOMAINS`): viem `generatePrivateKey()` → `requestSiweNonce()` → `createSiweMessage` (viem/siwe) → sign → `verifySiwe()` (creates user + Imported wallet row in one tx).
     **test-otp mode** (non-prod): `POST authentication/request-token/test` with `bot-<name>@bots.local` → `exchangeLoginToken`.
  2. `updateUsername(name)`; on 409 take the next pool name. ENS-mint side effect is harmless.
  3. `--claim-bonus` flag: `getWelcomeBonus()`/`claimWelcomeBonus()` per bot, tolerate 4xx (needs server `FAUCET_KEY`). Only run when staked mode is planned — it's real treasury float.
- **Every ApiClient** uses `appPlatform: 'web'` (avoids the Mobile platform pin AND bypasses `SupportedVersionGuard`). Set once in `auth/login.ts`.
- **Runtime sessions**: fresh login per bot activation, tokens in memory only (2d access token ≫ session length, so refresh-token replay hazards never arise). `onSessionExpired` → re-login → recovery.

## Step 4 — Sockets (`net/socket.ts`)

Pattern from `test/harness/actor.ts:90`: `io(url, {auth: {token}, transports: ['websocket'], forceNew: true})` — `forceNew` is mandatory (socket.io multiplexes otherwise) and strictly **one socket per account** (the gateway kills the previous one). Enable reconnection with backoff; on (re)connect, re-`channel:join` whatever the state machine says (`lobby`, `game:<roomId>`) and resync via REST. **30s gotcha**: a hosting bot whose socket drops loses its Pending room after 30s (`room-abandon.service.ts`) — after reconnect `getMyActiveGameRoom()` is the source of truth; room gone → back to idle.

## Step 5 — Orchestrator specifics

- **LobbyModel**: `Map<roomId, {summary, seenAt}>` fed by `lobby:room-added/updated/removed` from idle bots' sockets (≥1 idle bot always subscribed to the lobby channel; dedupe by roomId), reconciled by `listPendingGameRooms()` every 20-30s. Age = `summary.createdAt` floored by `seenAt`. **Never join bot rooms; exclude them from the human-room count** (classified via own-account userId set — no `is_bot` column needed).
- **Rotation**: target count re-sampled in [min,max] every ~30min; activations pick least-recently-active (shuffled) with 0-2min stagger; random session lengths keep expiries staggered; retiring bot finishes its match first, replacement activates immediately.
- **JoinPolicy** (2s tick): candidates = human, public, Pending, has-driver gameType, stake acceptable. Per-room delay sampled once (10-25s); on ripeness claim in-memory (prevents pile-ons; a lost race 409 is safe — release + blacklist roomId). NavalBattle: 2xx join = match starting (stakes already held) → driver. Ludo joiner: wait for `game:started`; if not started in ~10min → `leaveGameRoom` + release. One match per bot (design invariant; server only enforces one *created* room).
- **CreatePolicy** (5s tick): under-floor + under-cap → jittered pause → idle bot `createGameRoom` (public, gameType from mix, stake per Step 6). Hosting NavalBattle: `game:opponent-joined` → play. Hosting Ludo: on `game:player-joined` wait a jittered 20-45s for stragglers then `startGameRoom` (min 2); full room auto-starts. TTL 3-8min with no joiner → `closeGameRoom` → idle.
- **Pacing**: `jitter(min,max)` clamped to `(turnDeadline - now) - 8000ms` — thinking pauses can never cause a timeout (turn clock is 30s, 3 timeouts = loss/elimination).

## Step 6 — Staking (`stakes/staking.ts`)

Flag off → free rooms only. Enabled: `StakeAsset.Kombat` only, amounts from the whitelist (⊂ `STAKE_PRESETS`, base units via 18 decimals); before any staked action check `getStakePotBalances()` KOMBAT ledger ≥ stake, else fall back to free; `BOTS_STAKED_SHARE` dice-roll keeps most activity free. Recommended guardrail: per-bot daily net-loss cap (`BOTS_STAKE_DAILY_LOSS_CAP`, in-memory, resets UTC midnight) → free-only when exceeded (mitigates bot-farming: skilled players milking beatable bots for KOMBAT).

## Step 7 — Match drivers

Interface: `play(ctx: {api, socket, roomId, myUserId, pacing, log, abort}): Promise<{winnerUserId: string|null}>`. Event-loops with REST-resync escape hatch (doubles as crash recovery).

**Battleship** (`battleship.protocol.ts` events):
1. `channel:join game:<id>` → `battleship:enter`.
2. Jittered setup pause (clamped vs `setupDeadline`; hard window 90s) → `battleship:ready` with `randomFleet()`/`randomMines()` (`battleship.rules.ts:297,278`, exactly 2 mines).
3. Local model (`myShots`, `revealedOpponentShips`, turn/deadline) from `battleship:start`, `battleship:shot`, `battleship:turn-timeout`.
4. My turn → pause → `battleship:fire {kind:'single', row, col}` aimed by `chooseAim(syntheticFleet, myShots)`. Single shots only (no torpedo/bomb — simpler and keeps bots beatable). Hits keep the turn.
5. `battleship:error` (no acks!) → `getBattleshipRoomState()` → rebuild → re-act. Same resync on reconnect.
6. Done on `winnerUserId != null` / `battleship:ended`.

**Ludo** (`ludo.protocol.ts` events):
1. Cue is room-level `game:started` (**no `ludo:start` exists**); first 30s clock arms at match creation, so enter **immediately**: `channel:join` → `ludo:enter` → `getLudoRoomState()` for seats/color/tokens/stage/turn.
2. Maintain state from `ludo:rolled`/`ludo:moved` (authoritative `tokens` — replace, don't replay), `ludo:turn-timeout`, `ludo:eliminated`, `ludo:ended`.
3. My turn stage `roll` → pause → `ludo:roll`; on my `ludo:rolled` with `stage:'move'` → pause → `ludo:move` with `chooseBotMove(tokens, myColor, die)` (`ludo.bot.ts:16`); null/invalid → `movableTokens[0]`. Follow `stage`/`nextTurnUserId` for extra-roll/third-six.
4. `ludo:error` → refetch state, re-act. Resolve on `ludo:ended` or own elimination.

**Boot/crash recovery** (activation path): `getMyActiveGameRoom()` → InProgress: attach driver (re-submit fleet if still in setup with no fleet); Pending-as-creator: adopt as hosting with fresh TTL; Pending-as-joiner: wait-for-start or leave. Covers restarts mid-anything.

## Step 8 — Ops

- Dev: `npm run bots` against local stack (server :3000, `SIWE_DOMAINS=localhost:5173` already in `.env.example`). Prod: `turbo run build` + `npm run start --workspace @gaming-platform/lobby-bots`.
- Graceful shutdown (SIGINT/SIGTERM): stop policies; hosting → `closeGameRoom`; Ludo joiner Pending → `leaveGameRoom`; playing → default `forfeit` (reads as "player left"); `drain` mode finishes matches (10min cap). Second signal = immediate exit.
- Logging: one line per state transition / policy decision, `[username]` prefix, orchestrator heartbeat (active bots, human/bot room counts, matches). Never log keys.

## Implementation order

1. Core `chooseAim` export + core rebuild.
2. Scaffold + config + logger + store + name pool.
3. `auth/login.ts` + provisioning CLI; verify against dev server.
4. `net/socket.ts` + smoke command (one bot: login, connect, lobby events).
5. Drivers (battleship first), tested by manually inviting a single hardcoded bot.
6. BotRuntime + recovery.
7. Orchestrator: LobbyModel → JoinPolicy → CreatePolicy → Rotation.
8. Staking (flagged) + shutdown + root scripts.
9. Tests + E2E pass.

## Verification

- **Unit** (node:test, no new deps): pacing clamp; claim map (no double-claim); bot/human room classification; synthetic-fleet + `chooseAim` behavior on scripted histories; `chooseBotMove` fallback; config validation.
- **E2E (local)**: provision 5 twice (idempotent); fast config (3 active, 5-8s delay, floor 1, TTL 60-90s); webgames on :5173 → bot room appears when lobby empty and closes after TTL; human NavalBattle room → different-named bot joins after delay → full match both outcomes (incl. letting the bot win via idle timeouts); Ludo room → bot joins → early start → full match, no missed 30s windows; kill runner mid-match → restart → recovery finishes it; brief server outage while hosting → resync or clean idle; staked smoke (dev): flag on + faucet + `--claim-bonus`, preset-1 staked match, free-fallback when pot drained.

## Risks / accepted defaults (flag to user, overridable)

- **Bots appear in match history/leaderboards** under human names — accepted (consistent with the "reads as human" intent); excluding them would need the `is_bot` migration + rankings change (out of scope, can follow up).
- **Staked mode = treasury exposure**: default off; KOMBAT-only, small presets, staked-share dial, daily loss cap. Do not enable in prod without a budget decision. Staked play vs undisclosed bots is the riskiest combination (fairness/ToS) — product call, recorded.
- **Defaults chosen**: shutdown = forfeit; bot-hosted Ludo starts early with 1 human after 20-45s; prod SIWE uses an existing `SIWE_DOMAINS` entry.
- Other game types (TripleCut/ChromaClash/Salvo) are ignored — no drivers.
