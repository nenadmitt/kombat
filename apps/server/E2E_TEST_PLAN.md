# Server E2E / integration test plan

Multi-socket, real-Postgres integration tests driving the full stack: HTTP →
gateway → match service → cache → ledger. Scope is the flow the product
actually runs, not unit-level branches.

**Verdict: all of it is possible, and most of it is straightforward.** No
production code needs to change. Nothing needs mocking except the chain
(and only for staked rooms). Estimated ~2.5–3 focused days, of which the
harness is roughly half.

## Status

| Phase | State |
|---|---|
| 0 — harness | **Done.** `test/harness/{app,db,actor,events,clock}.ts` + `fixtures/battleship.ts`, `jest.e2e.config.js`, `test/setup-env.ts` |
| 1 — room lifecycle | **Done.** `test/room-lifecycle.e2e-spec.ts` — 11 tests |
| 2 — battleship match | **Done.** `test/battleship.e2e-spec.ts` — 11 tests |
| 3 — timeouts | **Done.** `test/battleship-timeouts.e2e-spec.ts` — 7 tests |
| 4 — stakes | Not started |

**29 tests, 3 suites, ~24s.** Green across repeated runs; each phase was
mutation-checked (assertions deliberately broken to confirm they fail).

Run with `npm run test:e2e` (from `apps/server`). Needs the dev Postgres up on
`POSTGRES_PORT`; it creates and migrates `<POSTGRES_DB>_e2e` itself on first
run. `npm test` is unchanged and still needs no database.

---

## 1. Why this is feasible — the five enabling facts

These were verified by reading the code, not assumed.

| # | Fact | Why it matters |
|---|---|---|
| 1 | **A real-Postgres test precedent already exists** — `src/stake-pot/test/db-harness.ts` creates a separate `<POSTGRES_DB>_test` database, runs migrations, and truncates between cases | The hard part (DB lifecycle) is solved. Extend it, don't reinvent it. |
| 2 | **Auth is trivially mintable** — `jwtService.signAsync({ sub: userId })`, and the socket accepts `auth: { token }` in the handshake (`websockets.gateway.ts:extractToken`) | Test actors need no login flow, no email OTP, no wallet. One line per player. |
| 3 | **Cache falls back to in-memory when `REDIS_URL` is unset** (`cache.service.ts`) | No Redis container required. Single-instance is exactly the test topology. |
| 4 | **Settlement is a pure Postgres transaction** — `StakePotService.settleMatch()` locks balances, writes `stake_ledger_entries`, credits the winner. No viem, no RPC. | **Stake assertions after a win need no chain at all.** This was the biggest feasibility risk and it's clear. |
| 5 | **Deadlines are just data** — `cacheService.addDeadline(member, at)`, swept every 1s by `GameDeadlineSweeper` | Timeout tests write a deadline in the *past* and wait ~1.2s. No 30-second waits, no fake timers fighting async I/O. |

Fact 5 is the one that makes the timeout half of this suite practical rather
than painful. `TURN_SECONDS = 30` and `MAX_TIMEOUTS = 3` — a naive test that
actually waited would take 90+ seconds per case and be flaky. Rewriting the
deadline entry directly reduces that to ~1 second and is *more* faithful to
what production does, because it exercises the real sweeper path.

---

## 2. The four real obstacles

### 2.1 `socket.io-client` is not a server dependency

Currently only in `apps/mobile`. Needs adding as a **devDependency** of
`apps/server`. Trivial, but it's a `package.json` edit — coordinate so it
doesn't collide with the concurrent unit-test work.

### 2.2 Jest would sweep e2e specs into the unit run

`jest.config.js` uses `rootDir: 'src'` and `testRegex: '.*\\.spec\\.ts$'`.
An e2e file named `*.spec.ts` under `src/` gets picked up by plain
`npm test` — slowing every unit run and requiring Postgres for it.

**Fix:** name them `*.e2e-spec.ts`, put them in `apps/server/test/`, add
`jest.e2e.config.js` and a `test:e2e` script. The existing config and the
other instance's work stay untouched.

Keep `maxWorkers: 1` — already set in the unit config, and mandatory here
(shared DB, shared deadline schedule).

### 2.3 One socket per account

`handleConnection` calls `disconnectSockets(true)` on the user's room before
joining — **a second connection for the same userId kills the first.** Every
test actor must be a distinct user, and the harness must never silently
reconnect an actor. This is a real trap: a stray reconnect makes an unrelated
assertion fail three lines later with a confusing error.

### 2.4 Async event assertions are the flakiness surface

Every meaningful assertion is "a socket eventually received X". Needs one
well-built helper (§3.3) and discipline about **subscribing before acting** —
`await waitFor(...)` started *after* the triggering HTTP call is a race that
passes on a fast machine and fails in CI.

### Minor notes

- Users must exist in `users` before rooms reference them — needs a user fixture.
- Test app must mirror `main.ts`: `setGlobalPrefix('api/v1')` and the
  `ValidationPipe({ whitelist: true, transform: true })`. Skipping either makes
  routes 404 or DTO validation silently not run.
- Staked rooms need seeded `staked_balances` rows (`holdFromPot` reads them).
  Direct INSERT in a fixture is fine — it's an ordinary table.

---

## 3. Harness design

```
apps/server/
  jest.e2e.config.js          # rootDir '.', testRegex .e2e-spec.ts, maxWorkers 1
  test/
    harness/
      app.ts                  # boot Nest on an ephemeral port
      db.ts                   # extends stake-pot/test/db-harness.ts
      actor.ts                # user + JWT + connected socket
      events.ts               # waitFor / expectNoEvent / collector
      clock.ts                # deadline manipulation
      fixtures/
        battleship.ts         # deterministic fleets, winning shot sequence
        stakes.ts             # seed staked_balances
    room-lifecycle.e2e-spec.ts
    battleship-match.e2e-spec.ts
    battleship-timeouts.e2e-spec.ts
    battleship-stakes.e2e-spec.ts
```

### 3.1 App boot

```ts
const app = await NestFactory.create(AppModule);
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
app.setGlobalPrefix('api/v1', { exclude: ['health', 'healthcheck', 'status'] });
await app.listen(0);              // ephemeral port
const url = await app.getUrl();
```

No `RedisIoAdapter` — leave `REDIS_URL` unset so both the cache and the
socket adapter use their in-memory paths.

### 3.2 Actor

```ts
type Actor = {
  userId: string;
  token: string;
  socket: Socket;
  http: (method, path, body?) => Promise<Response>;   // injects Bearer
};
```

`createActor(app, label)` → insert user row → sign JWT → connect socket with
`auth: { token }` → await `connect`. Distinct userId per label (reuse
`testUserId(label)` from the existing harness).

### 3.3 Event helper — the load-bearing piece

```ts
function waitFor<T>(socket: Socket, event: string, timeoutMs = 4000): Promise<T>
function expectNoEvent(socket: Socket, event: string, withinMs = 500): Promise<void>
function collect(socket: Socket, ...events: string[]): { drain(): Event[] }
```

`waitFor` must attach its listener **immediately when called**, returning a
promise — so the pattern is:

```ts
const joined = waitFor(creator.socket, ROOM_EVENTS.opponentJoined);  // subscribe
await joiner.http('POST', `/games/rooms/${roomId}/join`);            // then act
expect(await joined).toMatchObject({ roomId });                      // then assert
```

Never `await` the action before subscribing.

### 3.4 Clock control

```ts
// Force the currently-scheduled deadline to fire on the sweeper's next tick.
async function expireDeadline(cache: CacheService, member: string) {
  await cache.addDeadline(member, Date.now() - 1);
}
```

`addDeadline` on an existing member is an upsert into the sorted schedule, so
this reschedules rather than duplicating. Then wait ~1.2× `SWEEP_INTERVAL_MS`
(1s) — or, better, `await waitFor(socket, BATTLESHIP_EVENTS.turnTimeout)`,
which is self-timing and doesn't hardcode a sleep.

The deadline member format comes from `parseDeadlineMember` in `src/cache` —
read it at implementation time and build members through the same helper
rather than string-concatenating.

### 3.5 Deterministic battleship fixture

The fleet is 5+4+3+3+2 = **17 cells**. A fixed placement — all five ships
laid horizontally in rows 0–4 starting at column 0 — gives a known, complete
17-shot winning sequence.

`MINES_PER_PLAYER = 2`, and a mine triggers a 3×3 blast **against its owner's
own fleet**, which would corrupt a naive shot count. Place both mines in the
far corner (rows 8–9) well clear of the ships, and never fire there in the
happy-path test. Mine behaviour gets its own dedicated case rather than
polluting the win path.

---

## 4. Test scenarios

Mapped directly to what you asked for. Every assertion below is backed by a
specific code path already read.

### 4.1 `room-lifecycle.e2e-spec.ts`

| Case | Trigger | Assertion | Backing code |
|---|---|---|---|
| Two players connect | socket handshake w/ valid JWT | both `connect`; no disconnect | `websockets.gateway.ts` |
| Bad token rejected | handshake w/ garbage token | `connect_error` / immediate disconnect | same |
| Creator creates room | `POST /games/rooms` | 201, `GameRoomSummary`, status Pending | `games.controller.ts:createRoom` |
| **Duplicate room rejected** | same creator posts again | 409 `"You already have an active game room…"` | `games.service.ts:73` |
| Lobby sees it | subscribed lobby channel | `lobby:room-added` | `games.service.ts:365` |
| **Joiner joins → creator notified** | `POST /:id/join` | creator receives `game:opponent-joined` | `ROOM_EVENTS.opponentJoined` |
| Cannot join own room | creator joins own | 409 `"You cannot join your own game room."` | `games.service.ts:168` |
| **Third player rejected** | third actor joins full room | 409 `"This room is no longer accepting players."` | `games.service.ts:196` |
| Room leaves lobby | after fill | `lobby:room-removed` | `games.service.ts:383` |
| Non-participant cannot subscribe | `channel:join` on game channel | not joined; warn path | `gateway.mayJoin` → `isParticipant` |

### 4.2 `battleship-match.e2e-spec.ts`

| Case | Assertion |
|---|---|
| Both `battleship:enter` | each gets `battleship:setup-state` with a `setupDeadline` |
| One player `ready` | opponent receives `battleship:opponent-ready` |
| Both `ready` | both receive `battleship:start` with `firstTurnUserId` + `turnDeadline` |
| Fire out of turn | `battleship:error` to caller only; no `battleship:shot` broadcast |
| Valid shot | both receive `battleship:shot` with correct hit/miss |
| **Win** | after the 17th hit, `shot` payload carries `winnerUserId`; `battleship:ended` reason `complete` |
| Room persisted | `game_rooms.winner_user_id` + `end_reason` written | 
| Invalid fleet rejected | `ready` with overlapping ships → `battleship:error` |
| Non-participant fire | third actor fires → error, no state change |

### 4.3 `battleship-timeouts.e2e-spec.ts`

Uses §3.4 throughout.

| Case | Assertion |
|---|---|
| Setup deadline expires | `battleship:ended` — both sides failed to deploy |
| One turn times out | `battleship:turn-timeout`; turn passes to opponent; `turnSeq` advances |
| Stale deadline is dropped | expire a deadline for a turn that already advanced → no event (the sweeper's re-validation under lock) |
| **Three timeouts → loss** | expire 3× for the same player → `battleship:ended`, opponent is `winnerUserId` |
| Forfeit | `battleship:forfeit` → `ended` with reason `forfeit`, opponent wins |

The "stale deadline dropped" case is worth including — it's the exact
correctness property the sweeper's comment claims, and nothing currently
proves it end-to-end.

### 4.4 `battleship-stakes.e2e-spec.ts`

Requires seeded `staked_balances` and a stubbed chain layer only for the
*deposit* side. Settlement itself is real.

| Case | Assertion |
|---|---|
| Create staked room | `stakeToken`/`stakeAmount` persisted |
| Room fills | both receive `stake:funding` then `stake:funded` |
| Balances locked | `staked_balances.locked` == stake for both players |
| Play before funded | `assertRoomPlayable` throws → `battleship:error` "Stakes are still being secured." |
| **Win → stakes move** | winner `available` increases by `payout`; both players get a `Capture` entry; winner gets a `Prize` entry; `stake_ledger_entries` balances net out |
| Fee correct | `fee == pot * STAKE_FEE_BPS / 10000`; platform balance credited |
| Settlement terminal | `match_settlements.status == Settled`, `payout`/`fee` recorded |
| **Double settlement is a no-op** | call `completeMatch` twice → second returns early, no double payout (`claimMatchSettlement`) |
| Insufficient balance | join without funds → 409, room not started |

The double-settlement case is the highest-value test in the whole suite —
it guards real money and the guard is a conditional UPDATE that's easy to
regress.

---

## 5. Difficulty and effort

| Phase | Work | Effort | Risk |
|---|---|---|---|
| 0 | Harness: config, app boot, DB, actors, event helpers | 0.75–1 day | **Medium** — all novelty is here |
| 1 | Room lifecycle (§4.1) | 0.5 day | Low |
| 2 | Battleship happy path + win (§4.2) | 0.5 day | Low–Medium (fixture design) |
| 3 | Timeouts (§4.3) | 0.5 day | Medium — deadline member format, sweeper timing |
| 4 | Stakes (§4.4) | 0.5 day | Medium — balance seeding, chain stub boundary |

**Total ≈ 2.5–3 days.** Phases 1–4 are largely mechanical once Phase 0 lands;
the honest risk is concentrated in the harness and in timing discipline.

**Difficulty: moderate, not hard.** This codebase is unusually well-shaped for
integration testing — pure rules in `packages/core`, gateways that hold no
state, deadlines as data, settlement as a DB transaction. The things that
normally make e2e miserable (time, money, external services) are all
addressable in-process here.

---

## 6. Coordination with the concurrent unit-test work

Another instance is active in `src/games/stakes/`
(`stakes.service.settlement.spec.ts` modified 2026-08-01 02:16).

To stay out of its way:

- **All new files under `apps/server/test/`** — a directory it isn't touching.
- **Do not modify `jest.config.js`** — add `jest.e2e.config.js` alongside it.
- **`package.json` is the one shared file** (`socket.io-client` devDep +
  `test:e2e` script). Make that edit once, early, and mention it.
- Do not refactor `stakes.service.ts` or anything under `src/games/stakes/`.
  If an e2e test needs a seam there, note it and work around it for now.

---

## 7. Open questions

**Resolved during Phase 0:**

1. ~~Chain stub boundary~~ — **no module surgery needed.** `PotEventWatcher.onModuleInit` returns early on `!chainService.enabled`, and `StakeSweeper` on `!stakesService.enabled`. `test/setup-env.ts` blanks `CHAIN_RPC_URL` / `STAKE_POT_ADDRESS` / `OPERATOR_PRIVATE_KEY` / `FAUCET_KEY`, so every chain job stays inert while the full `AppModule` boots.
2. ~~Which Postgres~~ — **separate `<POSTGRES_DB>_e2e`.** This suite truncates users/rooms/settlements wholesale, which would destroy rows the stake-pot suite is mid-assertion on. Migrations aren't a second path: `MigrationService` runs them on app boot, so the test DB migrates itself.
3. ~~Truncation scope~~ — **truncate, list in `test/harness/db.ts`.** `app_settings` is deliberately excluded (maintenance-mode defaults) and `migrations_typeorm` obviously so.

**Still open:**

4. **CI.** Nothing currently runs `npm test` in CI — both workflows are `workflow_dispatch` image builds. Worth deciding whether either suite gates anything, and whether CI gets a Postgres service container for the e2e run.
5. **Env override is process-global.** `setup-env.ts` mutates `process.env` before `AppModule` is imported, which only works because `ConfigModule` skips keys already present. It's the standard approach, but it means the e2e config can never be merged into `jest.config.js` without the unit suite inheriting a blanked `REDIS_URL`.

---

## 8. Recommendation

Build Phase 0 + Phase 1 first and get them green. That proves the harness
against the cheapest scenarios (pure HTTP + a couple of broadcasts) before
committing to the fiddlier match/timeout/stake work. If the harness is sound,
phases 2–4 are mostly fixture authoring.

Start there rather than writing all four spec files against an unproven
harness.
