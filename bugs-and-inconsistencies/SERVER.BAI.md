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
- **2026-08-03:** decided to keep the fallback as-is - running without Redis
  is a supported deployment. Revisit before ever scaling past one instance.
  Note the rate limiter (`ThrottlerModule`) also counts per instance.
- **2026-08-04:** the health probes no longer hide this - `/health` and
  `/healthcheck` now report `instance` and `socketAdapter` alongside the
  cache driver, so an adapter sitting on the memory fallback is visible
  without reading boot logs.

## 2026-08-03 - No fee bump or cancel for a stuck operator transaction

- **Where:** `apps/server/src/chain/chain.service.ts` /
  `apps/server/src/stake-pot/stake-pot-chain.service.ts` (operator sends).
- **Why it's wrong:** an underpriced operator transaction holds the nonce and
  blocks every subsequent withdrawal and gas top-up until it mines or is
  replaced by hand. The lock-TTL/receipt-timeout collision from the
  2026-07-31 audit is fixed (TTL 240s > 180s receipt timeout), but there is
  still no replacement/cancel path and no alert on a stuck tx.
- **Suggested fix:** track the operator nonce, rebroadcast with a higher fee
  after a timeout, and surface a stuck-tx alert through the admin surface.
