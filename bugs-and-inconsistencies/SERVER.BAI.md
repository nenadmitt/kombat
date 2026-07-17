# SERVER - bugs and inconsistencies

Entry format: date, one-line summary, location, why it's wrong, suggested
fix. Remove an entry in the same change that fixes it.

## 2026-07-17 - History shows only the first opponent for Ludo matches

- **Where:** `apps/server/src/games/games.service.ts#getHistory` (opponent
  resolution) and `MatchHistoryEntry.opponentUsername` (singular) in
  `packages/core/src/games/stake.types.ts`.
- **Why it's wrong:** a 3-4 player Ludo match lists one opponent name; the
  others are invisible in History.
- **Suggested fix:** add `opponentUsernames: string[]` to the entry (keep
  the singular field for compatibility) and render "vs A, B, C" on mobile.

## 2026-07-17 - joinGameRoom is an unconditional update: two concurrent joiners can race

- **Where:** `apps/server/src/db/db.service.ts:209` (`joinGameRoom`), called
  from `apps/server/src/games/games.service.ts` `joinRoom`.
- **Why it's wrong:** `joinRoom` checks `status === Pending` in application
  code, then `joinGameRoom` runs `UPDATE ... SET opponent_id, status` with
  only `{ id }` in the WHERE clause. Two users joining the same room at the
  same moment both pass the Pending check; the second UPDATE silently
  overwrites the first opponent. The first joiner's client then believes it
  is in a match it was evicted from. Today the window is small; it becomes a
  real path once anything automated (e.g. a lobby-fill bot) joins rooms and
  can collide with a human tapping Join.
- **Suggested fix:** make the update conditional —
  `UPDATE ... WHERE id = :id AND status = Pending AND opponent_id IS NULL` —
  and have `joinRoom` treat 0 affected rows as "room no longer accepting
  players".

## 2026-07-17 - In-memory cache fallback is unsafe once multiple instances run

- **Where:** `apps/server/src/cache/cache.module.ts` (Redis-unreachable
  branch falls back to `InMemoryCacheStore` with only a warning).
- **Why it's wrong:** match state, room locks, and the deadline schedule all
  live in the cache. With more than one instance, an instance that silently
  fell back to memory disagrees with the others about the same match (split
  boards, double timeouts, phantom locks). The same applies to the socket.io
  Redis adapter fallback in `main.ts`: it degrades to single-instance
  delivery. Fine for one instance; a correctness bug the moment a second one
  starts.
- **Suggested fix:** add an env flag (e.g. `REQUIRE_REDIS=true`, set in any
  multi-instance deployment) that turns both fallbacks into hard boot
  failures instead of warnings.
