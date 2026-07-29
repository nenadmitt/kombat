# Report: both players stuck on the loading spinner at match start

## Symptom

A multiplayer match starts, both clients navigate into the game screen, and
**both** sit on the spinner forever. Not a crash, no error, no red screen. The
socket stays connected, so nothing ever kicks them out of it either. Killing
and reopening the app fixes it, because that remounts the screen.

## The short version

Two independent faults lined up:

1. **The client gave up after one try.** Every multiplayer engine fetches its
   snapshot once on mount and swallows a failure, on the assumption that a
   reconnect or remount will retry. Neither happens while the socket is
   healthy, so one failed fetch = spinner for the rest of the match.
2. **That fetch legitimately fails for a window at kickoff**, and without
   Redis the window is up to a minute wide.

Fault 2 is what fires the gun; fault 1 is why it is fatal instead of a blip.

## Fault 1: a failed first fetch was permanent

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

## Fault 2: the state read is legitimately rejected around kickoff

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

- It needs two clients and a real start transition, so it never shows up in
  single-player demo testing.
- On one instance with a warm cache the window is milliseconds wide, so it
  looks like a flake rather than a bug.
- The `catch {}` hid the 409 completely - no log, no toast, no error state.
  The screen simply stayed on its loading branch.

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
