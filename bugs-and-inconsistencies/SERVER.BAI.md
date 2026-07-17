# SERVER - bugs and inconsistencies

Entry format: date, one-line summary, location, why it's wrong, suggested
fix. Remove an entry in the same change that fixes it.

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
