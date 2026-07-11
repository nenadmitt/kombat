# Stateless server — implementation plan

Goal: no gameplay state lives in Node process memory. Any instance can serve any
event; a restart/deploy loses connections but not matches. Redis is the shared
store when configured; without it the server behaves exactly as today
(single-instance, in-memory).

Scope: parts 1–2 are to be implemented. Part 3 (multi-instance websockets) is a
design to review — do NOT implement it in this ticket.

---

## Current state inventory (what must move)

| State | Where | Notes |
| --- | --- | --- |
| `matches: Map<string, MatchState>` | `src/games/battleships/battleship-match.service.ts:63` | The authoritative game state. Already JSON-safe (plain objects/arrays/primitives, no Dates/Maps). |
| `turnTimers` / `setupTimers` (`setTimeout`s) | `src/games/battleships/battleship.gateway.ts` | Server-authoritative turn/setup enforcement. Deadlines already exist inside `MatchState` (`setupDeadline`, `turnStartedAt` + `TURN_SECONDS`). |
| `gameMessages: Map<string, string[]>` | `src/websockets/websockets.gateway.ts` | Throwaway chat log. Move to cache (cheap) — do not delete the feature. |
| presence `online: Record<string, boolean>` | inside `MatchState` | Updated on enter/disconnect; moves with the match document. |
| `findGameRoomById` per-move SELECT | `src/db/db.service.ts:148`, called from `battleship.gateway.ts#loadParticipantRoom` on every enter/ready/fire/forfeit | To be cached (item 2 of the ticket). |

REST consumer to keep in mind: `games.controller.ts:107` calls
`battleshipMatchService.stateFor(...)` — its signature goes async too.

---

## Part 1 — Cache module (Redis with in-memory fallback)

New module `src/cache/`:

```
src/cache/
  cache.module.ts        // @Global()
  cache.service.ts       // facade the app injects
  stores/cache-store.ts  // interface + key/TTL constants
  stores/redis.store.ts  // ioredis implementation
  stores/memory.store.ts // in-process implementation (current behavior)
```

### Interface

Keep it minimal but sufficient for atomic match updates and the deadline
sweeper (Part 2):

```ts
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;

  /** SET NX PX — returns a lock token, or null if already held. */
  tryLock(key: string, ttlMs: number): Promise<string | null>;
  /** Releases only if the token still matches (Lua compare-and-del). */
  unlock(key: string, token: string): Promise<void>;

  /** ZADD — schedule `member` at epoch-ms `at`. */
  addDeadline(member: string, at: number): Promise<void>;
  removeDeadline(member: string): Promise<void>;
  /** Atomically pop members due at/before `now` (Lua: ZRANGEBYSCORE + ZREM). */
  popDueDeadlines(now: number, limit: number): Promise<string[]>;
}
```

- **RedisCacheStore**: `ioredis` (add to `apps/server/package.json`). Lua for
  `unlock` and `popDueDeadlines` (both are 5-liners; register with
  `defineCommand`). Single ZSET key for deadlines: `bs:deadlines`.
- **InMemoryCacheStore**: `Map<string, {value, expiresAt}>` + a sorted array or
  Map for deadlines. Node is single-threaded so `tryLock` is trivially correct.
  This preserves today's behavior when Redis is absent.

### Selection & config

- `ConfigurationService`: add optional `REDIS_URL: string | undefined`
  (`this.configService.get('REDIS_URL')`). Add `REDIS_URL=` (commented) to
  `.env.example` with a note that unset ⇒ in-memory.
- `CacheModule` provides `CacheService` via an async factory: if `REDIS_URL` is
  set, create the ioredis client with `connectTimeout: 2000`,
  `maxRetriesPerRequest: 2`, `lazyConnect: true`; `await client.connect()` — on
  failure **log a warning and fall back to memory** (do not crash). Log one
  line at boot: `Cache store: redis` / `Cache store: memory (REDIS_URL not set)`.
- Expose `cacheService.driver: 'redis' | 'memory'` and surface it in the
  existing `/health` payload.
- Dev infra: add to `apps/server/docker-compose.yaml`:

```yaml
  redis:
    image: redis:7-alpine
    container_name: gaming-platform-redis
    restart: always
    ports:
      - '6380:6379'
```

### Serialization helper

`CacheService` should offer typed JSON helpers so callers never touch strings:

```ts
getJson<T>(key): Promise<T | null>
setJson<T>(key, value: T, ttlSeconds?): Promise<void>
withLock<T>(key, ttlMs, fn: () => Promise<T>): Promise<T>  // acquire → fn → release; retry w/ backoff (e.g. 5 × 50–250ms jitter), throw 503 ConflictException on failure
```

---

## Part 2 — Move match state to the cache

### Key schema (constants in `stores/cache-store.ts`)

| Key | Value | TTL |
| --- | --- | --- |
| `bs:match:{roomId}` | `MatchState` JSON (add `turnSeq: number`, see below) | 24h, refreshed on every write |
| `bs:chat:{roomId}` | `string[]` JSON | 24h |
| `room:{roomId}` | `GameRoomEntity` JSON | 60s |
| `lock:bs:{roomId}` | lock token | 5s (auto-expire safety) |
| `bs:deadlines` | ZSET `member = "{roomId}|{kind}|{turnSeq}"`, `score = deadline ms` | n/a |

### 2a. `BattleshipMatchService` → async, cache-backed

Every public method becomes `async` and follows **lock → read → mutate → write
→ unlock** via `cacheService.withLock('lock:bs:'+roomId, ...)`:

- `getOrCreate(room)` — under lock: `getJson`; if missing, build the same
  initial `MatchState` (plus `turnSeq: 0`) and `setJson`; also
  `addDeadline("{roomId}|setup|0", setupDeadline)`. Creation moves here from
  the gateway's `armSetupTimer`.
- `setFleet` / `fire` / `timeoutTurn` / `forfeit` / `timeoutSetup` /
  `setPresence` — same logic as today, but on the loaded document; persist at
  the end. Rules for deadlines inside the same locked section:
  - whenever `turnUserId`/`turnStartedAt` changes: `turnSeq += 1`,
    `removeDeadline` is unnecessary (stale members are filtered by seq),
    `addDeadline("{roomId}|turn|{turnSeq}", turnStartedAt + TURN_SECONDS*1000)`.
  - on `phase = 'play'`: add the first turn deadline (as above).
  - on `phase = 'over'`: no new deadlines.
- `stateFor` — plain `getJson` (no lock; read-only snapshot).
- `remove(roomId)` — `del(bs:match:{roomId}, bs:chat:{roomId})`.

`MatchState` is already serializable; the only schema change is the new
`turnSeq` field. Keep the class API identical otherwise so the gateway diff
stays small.

### 2b. Timers → deadline sweeper (replaces `setTimeout` maps)

Delete `turnTimers`/`setupTimers` and `armSetupTimer`/`armTurnTimer`/
`clearSetupTimer`/`clearTurnTimer` from `battleship.gateway.ts`. Replace with a
new `BattleshipDeadlineSweeper` (provider in the battleships module):

- `setInterval` every **1000ms** (fine for 60s turns; guard against overlap
  with an in-flight flag): `popDueDeadlines(Date.now(), 50)`.
- For each member `"{roomId}|{kind}|{seq}"`: call the matching service method,
  which under the room lock **re-validates before acting** — for `turn`:
  `phase === 'play' && match.turnSeq === seq`; for `setup`:
  `phase === 'setup'`. Stale/duplicate members are dropped silently (this is
  what makes enforcement idempotent and multi-instance-safe: `popDueDeadlines`
  is atomic, so exactly one instance pops a given member).
- After a successful timeout transition, broadcast exactly what the gateway
  broadcasts today (`turnTimeout` / `ended` + `completeGameRoom` on match end).
  Reuse the existing payload builders; inject `WebsocketsService` + `DbService`.
- Sweeper runs on every instance; that's safe because of the atomic pop.

### 2c. `gameMessages` → cache

`websockets.gateway.ts#handleGameMessage`: replace the Map with
`getJson<string[]>('bs:chat:'+roomId) ?? []`, append, `setJson`. (Race between
two simultaneous messages may drop one — acceptable for the placeholder; note
it in a comment rather than adding locking.)

### 2d. Cache `findGameRoomById`

In `DbService` (so every caller benefits):

- `findGameRoomById`: try `room:{id}` → on miss, SELECT and `setJson` (60s).
  Deserialized object must be usable where an entity is expected — the gateway
  only reads `id`/`userId`/`opponentId`/`status`, but re-`create()` it through
  the repository (`this.gameRoomRepository.create(json)`) to be safe.
- **Invalidate (`del('room:'+id)`) in every game-room write path** in
  `DbService` — audit all of them: `completeGameRoom`, and the create/join/
  cancel/set-opponent methods present in the file (grep `gameRoomRepository.`).
  Invalidate *after* the DB write commits.
- 60s TTL bounds staleness even if an invalidation is missed.

### 2e. Call-site updates (compile-driven)

- `battleship.gateway.ts`: every `matchService.*` call gets `await`; timer
  code deleted (2b); `endMatch` now also calls `matchService.remove`? — **No**:
  keep the finished match readable (today it stays in memory for the "over"
  screen). TTL handles cleanup. `markOnline`'s `client.once('disconnect', …)`
  callback must `void`-await `setPresence`.
- `games.controller.ts`: `await` on `stateFor` (and `getOrCreate` if used).
- Anything else the compiler flags.

---

## Part 3 — Multi-instance websockets (DESIGN ONLY — separate ticket)

With Parts 1–2 done, game state is shared and enforcement is idempotent, so the
remaining work is purely the socket layer:

1. **Cross-instance broadcast** — `@socket.io/redis-adapter`. Custom Nest
   `IoAdapter` (`RedisIoAdapter extends IoAdapter`) that creates pub/sub
   duplicates of the Redis client and calls `server.adapter(createAdapter(pub, sub))`;
   registered in `main.ts` via `app.useWebSocketAdapter(...)` **only when Redis
   is configured**. After this, `server.to(room).emit(...)` (i.e. all of
   `WebsocketsService`) transparently reaches sockets on every instance —
   including sweeper broadcasts for rooms whose players are connected elsewhere.
2. **Load-balancer stickiness** — socket.io's default polling→upgrade handshake
   requires sticky sessions (cookie or ip-hash). Recommended instead: force
   `transports: ['websocket']` on both client and server; then no stickiness is
   needed at all and any instance can accept any connection.
3. **No room affinity needed** — events mutate state under the per-room Redis
   lock, so it's correct regardless of which instance the socket lands on.
4. **Deploys / restarts (graceful drain)** —
   `app.enableShutdownHooks()`; on SIGTERM: mark `/health` unhealthy (LB stops
   routing), `io.disconnectSockets(true)`, close after a short grace window.
   Clients auto-reconnect (socket.io built-in) to a healthy instance and
   re-emit `battleship:enter` → get a full `stateFor` snapshot from Redis.
   Matches, deadlines and timeout enforcement survive because they live in
   Redis and the surviving instances' sweepers keep popping the shared ZSET.
   **Client contract to verify:** the mobile app must re-auth + re-join
   channels + re-enter the room on `reconnect` (it re-enters on screen focus
   today; add a socket `reconnect` listener if missing).
5. **Presence caveat** — a hard-killed instance never fires `disconnect`, so
   `online` flags can go stale. Mitigation (later): heartbeat timestamps
   instead of booleans, or socket.io `serverSideEmit` reconciliation.
6. **Ops** — scale on socket count/CPU; per-socket message rate limit before
   exposing to real load; `maxHttpBufferSize` sanity cap.

---

## Rollout order

1. Cache module + fallback + health line (deployable alone, no behavior change).
2. `findGameRoomById` cache + invalidations (small, immediately cuts per-move DB reads).
3. Match state + sweeper migration (the big diff; single-instance behavior must be identical).
4. Part 3 as its own ticket.

## Test plan

- Unit: both stores against the `CacheStore` contract (get/set/TTL/lock
  contention/deadline pop atomicity — for memory store; for Redis, run the same
  suite against a real Redis in docker, skip when unavailable).
- Integration (single instance, memory store): full match — setup timeout path,
  turn timeout ×MAX_TIMEOUTS forfeit path, powerups, win path — asserting the
  same socket events as today.
- Integration (Redis): same suite with `REDIS_URL` set; plus "restart
  resilience": create match → drop the Nest app (keep Redis) → boot a fresh app
  → `stateFor` returns the live match and the sweeper still enforces the turn
  deadline.
- Fallback: boot with bogus `REDIS_URL` → warning logged, memory store active,
  everything still works.

## Acceptance criteria

- No `Map`/`setTimeout` holding match/timer/chat state in gateway or match
  service (grep-verifiable).
- With `REDIS_URL` set: a server restart mid-match resumes the match (snapshot
  + deadlines) after clients reconnect.
- Without `REDIS_URL`: behavior identical to today, zero new required config.
- Every enter/ready/fire/forfeit hits Postgres at most on room-cache misses
  (≤1 per room per 60s instead of 1 per move).
