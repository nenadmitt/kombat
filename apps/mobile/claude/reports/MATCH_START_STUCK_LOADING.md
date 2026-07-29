# Report: both players stuck on the loading spinner at match start

## Symptom

A multiplayer match starts, both clients navigate into the game screen, and
**both** sit on the spinner forever. Not a crash, no error, no red screen. The
socket stays connected, so nothing kicks them out of it.

**Restarting the app does not help.** The room is still `InProgress`, so the
app offers to reconnect to it, and reconnecting lands on the same spinner.

## Root cause: Salvo read the wrong seat column

`SalvoMatchService.getOrCreate` took the opponent from `room.opponentIds`:

```ts
const opponentId = room.opponentIds[0];
if (!opponentId || room.opponentIds.length !== 1) {
  throw new ConflictException('Salvo rooms hold exactly two players.');
}
```

But `opponent_ids` is the **multi-seat** column, and `isMultiSeatGame()` is
true only for Ludo and ChromaClash. A Salvo join therefore goes down the
two-player path, `DbService.joinGameRoom`, which seats the joiner in
**`opponent_id`** and leaves `opponent_ids` empty.

So the array was always empty, the guard always threw, and it threw on every
`salvo:enter` and every state read - for **both** players, **forever**. The
room really had started, which is why the resume prompt appears and why
reconnecting changes nothing.

Battleship, the other two-player game, reads `room.opponentId` correctly. The
new service simply used the wrong column.

**Fix:** read the roster through `participantsOf(room)`, which covers both
seatings, and require exactly two players.

A second Salvo defect surfaced alongside it: `GET /games/rooms/:id/state` had
no `GameType.Salvo` branch, so a Salvo room fell through to the Battleship
handler and would have had a *Battleship* match created against its room id.
Salvo is now dispatched explicitly, with a comment on the fall-through.

## Contributing faults (real, but not the cause)

These were found while chasing the above. Neither explains a permanent hang on
its own, but both would turn a transient hiccup into one, so they are fixed
too.

### A failed first fetch was permanent

`useMultiplayerChroma`, `useMultiplayerLudo` and `useMultiplayerRps` all do:

```ts
const syncState = useCallback(async () => {
  try {
    const s = await apiClient.getChromaRoomState(roomId);
    ...
    setLoaded(true);
  } catch {
    // Transient - reconnect/mount retries.
  }
}, [roomId]);
```

and gate the whole screen on it:

```ts
return { phase: loaded && discardTop !== null ? 'play' : 'waiting', ... };
```

`syncState` is called in exactly two places: once on mount, and once on a
`disconnected -> connected` transition. If the mount call fails and the socket
never drops, **nothing calls it again**. The comment's promise ("reconnect /
mount retries") is not kept by any code.

`useMultiplayerSalvo` has the same shape - it waits for a `salvo:state` push
that only arrives in response to `enter`, and `enter` was emitted once.

`useMultiplayerBattleship` is **not** affected: a failed fetch leaves it in
the `setup` phase, which is a real screen, not a spinner.

### The state read is legitimately rejected around kickoff

`GET /games/rooms/:id/state` calls `<game>MatchService.getOrCreate(room)`,
which throws when the room is not yet `InProgress`:

```ts
if (room.status !== GameRoomStatus.InProgress) {
  throw new ConflictException('The room has not started yet.');
}
```

The client navigates the instant the start event lands, mounts, and fetches
immediately. The server does order its writes correctly - `startGameRoom()` is
awaited before `ROOM_EVENTS.started` is emitted, and both `startGameRoom` and
`appendGameRoomOpponent` invalidate `CacheKeys.gameRoom(id)` - so on a single
instance the window is small.

**Without Redis it is not small.** `findGameRoomById` reads through a cache
with a 60 second TTL:

```ts
const cached = await this.cacheService.getJson<GameRoomEntity>(key);
if (cached) return this.reviveGameRoom(cached);
```

With `REDIS_URL` unset the store is `InMemoryCacheStore`, which is per-process.
An invalidation performed by instance A does not touch instance B's copy. If
instance A starts the room and the player's next HTTP request is served by
instance B, B keeps returning a **Pending** room for up to
`GAME_ROOM_TTL_SECONDS` (60s). Every state fetch in that window 409s.

Both players hit the same stale room, which is why **both** spin rather than
one. Combined with fault 1, a 409 anywhere in that window is permanent.

Note this is only reachable when running more than one instance without Redis,
which the root `CLAUDE.md` already calls out as unsupported
("in-memory fallback otherwise - single instance only"). But the failure mode
was silent and indistinguishable from a hang, so it read as a game bug rather
than a deployment one.

## Fixes

**Client - never give up on the first fetch.** New shared
`games/use-match-sync-retry.ts`: retries the snapshot with backoff
(0.4s, 0.8s, 1.5s, 3s, 5s, then 8s) until the engine reports it has what it
needs. Wired into Chroma, Ludo, Triple Cut and Salvo. For Salvo, whose
snapshot is a push, "retry" means re-emitting `enter`.

This alone makes the bug self-healing regardless of cache backend, which is
the point: it does not assume Redis is configured.

**Server - do not let a stale cached room decide whether a match may start.**
Added `DbService.findGameRoomByIdFresh()`, which bypasses the cache and
refreshes it. Used by:

- `GET /games/rooms/:id/state`
- every gateway's `enter` handler (via a `fresh` flag on
  `loadParticipantRoom`)

Per-action calls (play, fire, move) still use the cached read - they run on
every move, and they are not the ones deciding whether the room has started.

## Why it was not caught earlier

- Salvo multiplayer was never run end to end. It typechecked and built, and
  that was explicitly flagged as unverified when it shipped - this is exactly
  the class of bug that flag was about. Nothing in the type system connects
  "two-player game" to "reads `opponent_id`".
- It needs two clients and a real start transition, so single-player demo
  testing cannot see it.
- The `catch {}` hid the error completely - no log, no toast, no error state.
  The screen simply stayed on its loading branch, which is why it read as a
  hang rather than a failed request.

## Correction to an earlier draft of this report

The first version of this report blamed the cache/retry faults below and
claimed restarting the app fixed it. That was wrong on both counts: restarting
does not fix it, and a transient cause cannot explain a permanent hang. The
seating mismatch above is the actual cause.

## Third round: joiner-only spinner (Salvo), and what the evidence proved

Reported after the seating fix: creator enters and plays fine, the joiner
stays on the spinner. Two log lines cracked the shape of it:

- The creator sees "<joiner> ran out of time" notices. So the match exists,
  the turn clock runs, and the sweeper enforces it - the server core is
  healthy, and after MAX_TIMEOUTS the stuck joiner loses by timeout. That
  part is by design, given the joiner never acts.
- The server logs `MaxListenersExceededWarning: 11 disconnect listeners
  added to [Socket]`. `markOnline` added a disconnect hook on **every**
  enter, and the only thing that re-emits enter is the retry loop added in
  round two. Eleven listeners on one socket = eleven enters that ran all the
  way through `handleEnter` - which means `client.emit(salvo:state, ...)`
  executed each time, on the joiner's own socket.

So by round three the server was demonstrably accepting the joiner's enter
and pushing the snapshot repeatedly, and the client was not applying it. The
defect is in the last hop - delivery or reception on the joiner's device -
which static review cannot pin from here (it needs the two-device setup).

Fixed this round:

- **Listener leak**: every gateway's `markOnline` now registers its
  disconnect hook once per socket+room. Retried enters are normal and must
  be idempotent.
- **The spinner can no longer be mute - in any of the five games.** Every
  multiplayer engine exposes `waitingError` and every container surfaces it
  (the four spinner games under their spinner; Battleship on the
  waiting-for-opponent screen). The REST engines surface the snapshot
  fetch's failure message, and every engine now subscribes to its gateway's
  `<game>:error` push - previously only Salvo did; the other four clients
  ignored gateway failures entirely. Everything is also `console.warn`ed.
- **Battleship got the retry too.** It had been excluded on the grounds that
  a failed fetch "leaves the player in setup, not on a spinner" - but that
  is its own bug: on a resume into a live match, a failed fetch silently
  rendered the setup screen of a match already in play. The snapshot now
  retries until it lands, so the phase self-corrects.

If the joiner still spins, the screen now names the reason. If it spins
with **no** message while the server stacks enters, reception is the fault,
and the checklist is environmental:

1. Do both devices point at the **same** `apiBaseUrl` in `apps/mobile/.env`?
   (Simulator on localhost + device on a LAN IP hitting a different server
   instance produces exactly this split.)
2. Were both app bundles rebuilt after the fixes?
3. Is the server a single instance, or multi-instance with `REDIS_URL` set?
   In-memory match state cannot be shared across instances.

## Rules to prevent recurrence

1. **A screen whose only exit is a successful fetch must retry that fetch.**
   If a `catch` comments that "something else will retry", point at the code
   that does, or write the retry.
2. **Never swallow an error that gates a whole screen.** Either retry it or
   surface it. Silent catch plus a boolean gate is a hang.
3. **Anything deciding whether a match may start must read the room fresh.**
   The cached read is for hot paths, not for start/authorisation decisions.
4. Assume the cache may be stale on some instance. Correctness must not
   depend on `REDIS_URL` being set; Redis should make things faster, not
   correct.
5. **A two-player game reads `room.opponentId`; a multi-seat game reads
   `room.opponentIds`.** Prefer `participantsOf(room)`, which covers both. The
   seating a room gets is decided by `isMultiSeatGame(gameType)`, nowhere near
   the match service that consumes it.
6. **Dispatch every new game type in `GET /games/rooms/:id/state`.** It falls
   through to Battleship, so a missing branch silently creates a Battleship
   match against another game's room id.
7. **Socket enter handlers run many times per socket.** Client retries and
   reconnect replays make enter idempotency mandatory - including resource
   registration like disconnect hooks, not just state writes.
