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

## 2026-07-30 - `docker compose up` in apps/server can recreate another project's database

- **Where:** `apps/server/docker-compose.yaml` (no top-level `name:`).
- **Why it's wrong:** with no project name, Compose derives one from the
  directory, which is `server`. `/Users/arti/namespace-v2/arti-contracts/packages/server/docker-compose.yml`
  resolves to the same project, so `docker compose up -d` here matched that
  project's running `postgres` service and printed
  `Container namespace-server-db  Recreate` — i.e. it was about to replace an
  unrelated project's database container. It only aborted because the
  `gaming-platform-redis` container name was already taken (that container
  carries the label `com.docker.compose.project=kombat-server`, so a project
  name used to be set and has since been lost).
- **Suggested fix:** add `name: kombat-server` at the top of
  `apps/server/docker-compose.yaml` so the project is explicit and can never
  collide with another checkout's `server` directory.

## 2026-07-30 - StakeSweeper's staleness check is skewed by the DB/process timezone gap

- **Where:** `apps/server/src/games/stakes/stake.sweeper.ts` (`Date.now() -
  escrow.updatedAt.getTime() > FUNDING_STALE_MS`), against
  `stake_escrows.updated_at`, which the migration declares as `TIMESTAMP`
  (no time zone).
- **Why it's wrong:** the column stores UTC (`DEFAULT now()` under a UTC
  server) but node-postgres parses `timestamp without time zone` as *local*
  time, so the JS Date is off by the process's UTC offset. Measured on this
  machine (Postgres `Etc/UTC`, Node `UTC+2`) a row written a second earlier
  reads as 2 hours old. East of UTC every Funding row looks stale
  immediately, so the sweeper fights healthy funding jobs — exactly what the
  `FUNDING_STALE_MS > FUNDING_LOCK_TTL_MS` comment is trying to prevent. West
  of UTC the age goes negative and orphaned rows are never recovered at all.
  Found while building the stake pot's own sweeper, which hit the identical
  problem.
- **Suggested fix:** evaluate the cutoff in SQL, where both sides use the
  database clock — the stake pot does this in
  `StakePotService.findSweepableWithdrawals` (`updated_at < now() -
  make_interval(secs => :n)`). Declaring the timestamp columns `timestamptz`
  (as the four `stake_pot_*` tables do) removes the ambiguity at the source.
