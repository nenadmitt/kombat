# SERVER - bugs and inconsistencies

Entry format: date, one-line summary, location, why it's wrong, suggested
fix. Remove an entry in the same change that fixes it.

## 2026-08-09 - The admin panel's users.platform guard is dead once web accounts merge

- **Where:** `apps/server/src/db/db.service.ts` - `findUserPlatforms()`,
  `hasUserPlatformColumn()` and the `USER_PLATFORM_COLUMN` constant;
  `PLATFORM_LABELS` / the null branch in
  `apps/server/src/admin/admin.service.ts`.
- **Why it's wrong:** the admin stats panel was built on a branch that did not
  carry the `users.platform` migration, so it reads the column through an
  `information_schema` probe on every call and returns null when it is absent.
  `UserPlatform1785800000000` adds the column NOT NULL with a default, so once
  the web-accounts work is on develop the probe can only ever answer true. It
  is an extra query per stats request and a null branch in the panel that
  nothing can reach, plus a second hardcoded copy of the 0/1 mapping that the
  `UserPlatform` enum in `@gaming-platform/core` already owns.
- **Suggested fix:** drop `hasUserPlatformColumn()` and the null return, select
  the column directly (or through the entity, which now maps it), and import
  `UserPlatform` instead of `PLATFORM_LABELS`. Left alone for now because the
  file belongs to the admin-stats work, not the branch that added the column.

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

## 2026-08-07 - POST /stake-pot/claim reports `amount` in whole tokens, not base units

- **Where:** `apps/server/src/stake-pot/stake-pot.controller.ts` (the `claim`
  handler's `amount: String(this.faucetService.grantAmount)`).
- **Why it's wrong:** every other amount in the API crosses the wire as a
  base-unit decimal string, which is what `formatStakeAmount` expects. This one
  returns the whole-token count (`"500"`), so a client that formats it like any
  other amount divides by 1e18 and renders `0`. Mobile only escapes this by
  discarding the field entirely (`WelcomeBonusModal.tsx` hardcodes the label),
  which is why the inconsistency has gone unnoticed. `symbol` is likewise a
  hardcoded `'KOMBAT'` literal rather than `STAKE_ASSET_SYMBOLS[StakeAsset.Kombat]`.
- **Suggested fix:** return `this.faucetService.grantAmountBase` (added for
  `GET /stake-pot/welcome-bonus`, which does use base units) and
  `STAKE_ASSET_SYMBOLS[StakeAsset.Kombat]`. Both current consumers would be
  safe to change: mobile ignores the fields, and
  `apps/webgames/src/pages/WalletPage.tsx` prints `amount` verbatim with a
  comment pointing here.
