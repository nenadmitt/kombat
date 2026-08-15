# Lobby Bots — external bot runner (`apps/lobby-bots`)

## What it does

The lobby often looks empty, so real players create a room, see no action, and
leave. This runs **10 provisioned bot accounts**, all live at once, that:

1. Watch the lobby for rooms created by real players — free, or staked in
   **KOMBAT** when the bot's pot balance covers the stake.
2. **Join a human room that nobody has joined for 20-30 seconds.** Never join a
   room hosted by another bot.
3. **Keep at least 4 open rooms in the lobby.** When fewer are open, an idle bot
   hosts a new one.
4. **Play the match to the end** using the bot policies already in
   `packages/core`.

Everything runs through the existing public API and sockets as a real client:
the framework-free `ApiClient` (`packages/core/src/api/api-client.ts`) plus
`socket.io-client`, patterned on the e2e harness
(`apps/server/test/harness/actor.ts`). The runner never touches the database.

Bot accounts are marked `is_bot` on the server so they stay out of the
rankings — done, see "Server prerequisite" below.

## Architecture

One Node process, new workspace `@gaming-platform/lobby-bots` (root
`workspaces: ["apps/*"]` picks it up automatically). Each bot is one ApiClient +
one socket + a small state machine (`idle → hosting|joining → playing → idle`).
A central orchestrator owns the shared lobby view and the two policies.

```
main.ts ─ config ─ bot store (state/bots.json, gitignored)
   │
Orchestrator
   ├─ LobbyModel   (lobby socket events + periodic REST reconcile; room ages;
   │                bot-hosted rooms classified by creatorUserId ∈ own accounts)
   ├─ JoinPolicy   (human room older than its sampled 20-30s delay → one idle
   │                bot joins; in-memory claim stops pile-ons)
   ├─ CreatePolicy (open human+bot rooms < 4 → an idle bot hosts one)
   └─ BotRuntime × 10 ─ GameDriver (battleship | ludo) + human-ish pacing
```

## Server prerequisite (done)

- `users.is_bot` + migration `1786200000000-UserIsBot`, defaulting false.
- `findRankings` drops flagged accounts.
- `PATCH /admin/users/:id/bot` (admin-token guarded) — how provisioning marks
  each account. Keeps the runner off the database.
- Presence is deliberately untouched: every `getOnlineUserIds` consumer is
  operator-facing, so `AdminUserView` carries `isBot` instead. The exclusion
  belongs on whatever first shows presence to players.
- `chooseAim` + the `Aim` type are exported from core for the battleship driver.

## Step 1 — Workspace

```
apps/lobby-bots/
  package.json    deps: @gaming-platform/core, socket.io-client
                  scripts: build, typecheck, start, dev, provision, test
  tsconfig.json   .gitignore (state/)   .env.example
  src/
    main.ts  config.ts  logger.ts
    state/bot-store.ts        provision/{name-pool,provision}.ts
    auth/login.ts             net/socket.ts
    orchestrator/{orchestrator,lobby-model,join-policy,create-policy}.ts
    bot/{bot-runtime,pacing}.ts    stakes/staking.ts
    drivers/{driver,battleship.driver,ludo.driver}.ts
  test/           node:test unit tests
```

Root scripts: `bots` (dev) and `bots:provision`.

## Step 2 — Config

Env-first via `process.loadEnvFile()` on `apps/lobby-bots/.env`, no dotenv
dependency, defaults for everything:

| Key | Default | Meaning |
| --- | --- | --- |
| `BOTS_SERVER_URL` | `http://localhost:3000` | API + socket origin |
| `BOTS_COUNT` | 10 | accounts to provision and run |
| `BOTS_JOIN_DELAY_MS_MIN/MAX` | 20000 / 30000 | how long a human room must sit unanswered |
| `BOTS_MIN_OPEN_ROOMS` | 4 | lobby floor the create policy defends |
| `BOTS_MAX_HOSTED_ROOMS` | 4 | cap on rooms bots host at once |
| `BOTS_HOSTED_ROOM_TTL_MS_MIN/MAX` | 180000 / 480000 | close an unjoined hosted room after this |
| `BOTS_GAME_MIX` | `NavalBattle:0.6,Ludo:0.4` | what bots host |
| `BOTS_STAKES_ENABLED` | true | allow joining staked rooms |
| `BOTS_STAKE_ASSETS` | `Kombat` | the only asset bots will stake |
| `BOTS_ADMIN_TOKEN` | — | provisioning only, for the `is_bot` call |
| `BOTS_AUTH_MODE` | `test-otp` | `test-otp` (local) or `siwe` (prod) |

## Step 3 — Identity store + provisioning

- **Store**: `state/bots.json`, `{botId, username, email, userId, privateKey?,
  provisionedAt, markedBotAt}`; atomic write (tmp + rename), never logged.
  In production this file is a secret.
- **Name pool**: checked-in human-looking handles matching
  `^[a-zA-Z0-9_]{3,20}$`, mixed styles (`mike_p`, `Jenna94`, `oldwolf77`).
- **CLI** `npm run bots:provision -- --count 10`, idempotent (skips names
  already in the store), sequential with jitter, persists after each account:
  1. `test-otp`: `POST authentication/request-token/test` with
     `bot-<name>@bots.local` → `exchangeLoginToken`.
     `siwe`: viem `generatePrivateKey` → nonce → `createSiweMessage` → sign →
     `verifySiwe`.
  2. `updateUsername(name)`; on 409 take the next pool name.
  3. `PATCH admin/users/:id/bot {isBot:true}` with `BOTS_ADMIN_TOKEN`, recorded
     as `markedBotAt` and retried on the next run if it failed. Fail loudly
     when the token is missing — an unflagged bot pool is the thing this is
     meant to prevent.
- Every ApiClient uses `appPlatform: 'web'` (bypasses the mobile version gate).
- Runtime logins are fresh per start, tokens in memory only.

## Step 4 — Sockets

`io(url, {auth: {token}, transports: ['websocket'], forceNew: true})`.
`forceNew` is mandatory (socket.io multiplexes otherwise) and it is strictly one
socket per account — the gateway kills an account's previous socket. On
reconnect, re-join the channels the state machine expects and resync over REST.
A hosting bot that drops loses its Pending room after 30s
(`room-abandon.service.ts`), so after a reconnect `getMyActiveGameRoom()` is the
source of truth.

## Step 5 — Orchestrator

- **LobbyModel**: `Map<roomId, {summary, seenAt}>` fed by
  `lobby:room-added/updated/removed` from one subscribed socket, reconciled by
  `listPendingGameRooms()` every 20s. Room age is `max(createdAt, seenAt)`.
  Rooms whose `creatorUserId` is one of ours are bot rooms: never joined, but
  they do count toward the open-room floor.
- **JoinPolicy** (2s tick): candidates are public, Pending, human-hosted, a game
  we have a driver for, and stake-acceptable. Each room gets one sampled delay
  in [20s, 30s]; once it is older than that, an idle bot claims it in memory and
  joins. A lost race (409) releases the claim and blacklists the room id.
- **CreatePolicy** (5s tick): while open rooms < 4 and bot-hosted < cap, an idle
  bot creates one (free, game type from the mix) after a short jitter. A hosted
  room nobody joins is closed after its TTL and the bot goes idle.
- **Pacing**: every "thinking" pause is clamped to
  `(turnDeadline - now) - 8000ms`, so a pause can never cause a timeout.

## Step 6 — Staking

Bots stake **KOMBAT only**. Before joining a staked room, check
`getStakePotBalances()` — join only when `available[Kombat]` covers the stake,
otherwise skip the room. Bot-hosted rooms are always free, so bots never put
treasury at risk on their own initiative.

## Step 7 — Match drivers

`play(ctx): Promise<{winnerUserId: string | null}>`, event loops with a REST
resync escape hatch that doubles as crash recovery.

**Battleship**: `channel:join game:<id>` → `battleship:enter` → jittered setup
pause → `battleship:ready` with `randomFleet()`/`randomMines()` → on each of my
turns, `battleship:fire {kind:'single'}` aimed by `chooseAim` over a **synthetic
fleet built from `revealedOpponentShips`** (which makes unsunk hits stay
"active", exactly the behavior wanted). Single shots only — no power-ups, which
keeps bots beatable. `battleship:error` → refetch state → re-act.

**Ludo**: the cue is room-level `game:started` (there is no `ludo:start`), and
the first turn clock is already running, so enter immediately: `channel:join` →
`ludo:enter` → `getLudoRoomState()`. Then `ludo:roll` on my turn, and
`ludo:move` with `chooseBotMove(...)` when `stage === 'move'`, following
`stage`/`nextTurnUserId` for extra rolls and the third six. No abilities.

## Step 8 — Ops

- Dev: `npm run bots` against the local stack.
- Graceful shutdown (SIGINT/SIGTERM): stop the policies, close hosted rooms,
  leave Pending rooms, forfeit live matches so they read as "player left".
  A second signal exits immediately.
- Logging: one line per state transition and policy decision, `[username]`
  prefixed, plus an orchestrator heartbeat. Never log keys.

## Verification

- **Unit** (node:test): pacing clamp; claim map rejects a double claim; bot vs
  human room classification; the synthetic fleet + `chooseAim` on scripted shot
  histories; config parsing.
- **Manual E2E** against the local stack: provision 10 twice (idempotent);
  bots fill the lobby to 4 rooms; a human room gets joined after the delay and
  played to a result; a bot room is never joined by another bot.

## Accepted defaults

- Bots appear in match history under human names; they are out of the rankings.
- Bot-hosted rooms are free. Staked play is join-only, KOMBAT-only, and gated on
  the pot balance.
- Games without a driver (TripleCut, ChromaClash, Salvo, Rps) are ignored.
