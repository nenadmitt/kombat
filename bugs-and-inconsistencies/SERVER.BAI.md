# SERVER - bugs and inconsistencies

Entry format: date, one-line summary, location, why it's wrong, suggested
fix. Remove an entry in the same change that fixes it.

## 2026-08-13 - Ludo casts use four socket events for one uniform operation

- **Where:** `packages/core/src/games/ludo/ludo.protocol.ts` (`launch`,
  `jump`, `teleport`, `shield`) and their four handlers in
  `apps/server/src/games/ludo/ludo.gateway.ts`.
- **Why it's wrong:** all four casts carry the identical payload
  (`{roomId, tokenIndex}`) and identical guards; the split is a leftover
  from the placed-trap era when payloads differed. Battleship already
  models this as one `fire` event with a `kind` field, so the two games'
  protocols disagree on the same shape of operation, and every new ability
  costs an event + DTO + handler + client emitter.
- **Suggested fix:** one inbound `ludo:ability` event with
  `{roomId, kind, tokenIndex}` and a single `@IsIn`-validated DTO
  dispatching to the existing service methods. Keep the per-effect
  outbound broadcasts (their payloads genuinely differ). Update both
  webgames hooks and the e2e suites in the same change.

## 2026-08-10 - An eliminated Chroma player is never told their hand is gone

- **Where:** `apps/server/src/games/chroma/chroma-match.service.ts:572-573`
  (`eliminate()` empties `match.hands[userId]`), against the returns of
  `forfeit()` (~line 398, `changedHands: {}`) and `timeoutTurn()` (~line 372,
  which only carries the timed-out player's hand when they force-drew).
- **Why it's wrong:** the hand only reaches a client on the caller-only
  `chroma:hand` push, which the gateway sends per entry in `changedHands`.
  Elimination clears the server-side hand but never lists that user, so no
  push goes out and their client keeps rendering the cards it last received:
  the table's `handCounts` says 0 while their own hand still shows seven.
  Affects mobile and webgames equally.
- **Suggested fix:** set `changedHands[userId] = []` wherever `eliminate()`
  runs - simplest is to have `eliminate()` take the `changedHands` record (or
  return the cleared hand) so forfeit, timeout and any future caller cannot
  forget it.

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

## 2026-08-10 - `appendGameRoomOpponent` / `removeGameRoomOpponent` always report success

- **Where:** `apps/server/src/db/db.service.ts` (`appendGameRoomOpponent`,
  `removeGameRoomOpponent`) - both end with
  `return (result as unknown[]).length > 0`.
- **Why it's wrong:** TypeORM's `query()` returns `[rows, affectedCount]` for a
  DML statement, not a bare row array, so the length is **always 2** and both
  methods return `true` even when the UPDATE matched nothing. The guards in the
  SQL (room full, duplicate joiner, room already started, seat not held) still
  hold in the database, but `GamesService.joinMultiSeatRoom` and `leaveRoom`
  never see the rejection: a joiner who lost the race is told they were seated,
  and `leaveRoom` reports success for a room that already started. Verified with
  a probe: `UPDATE ... RETURNING "id"` on zero rows yields `[[], 0]`.
- **Suggested fix:** destructure - `const [rows] = await ...` and test
  `rows.length > 0` (this is what `joinGameRoom`'s new choice-carrying branch
  does).
## 2026-08-13 - A player can hold a created room and a seat in another at once

- **Where:** `apps/server/src/games/games.service.ts` - `createRoom` rejects a
  second room via `findOpenGameRoomForUser`, but `joinRoom` has no equivalent
  check.
- **Why it's wrong:** creating a room and then joining someone else's leaves
  the player in two live rooms. The webgames lobby renders both ("YOUR OPEN
  ROOM" and "YOUR SEAT"), which is what surfaced it, and if both start the
  player owes two matches at once while `getMyActiveGameRoom` can only name
  one - so the client resumes into an arbitrary half of it.
- **Suggested fix:** refuse a join while the caller still has an open room of
  their own, mirroring the createRoom guard, or close their pending room as
  part of the join.

## 2026-08-13 - A replaced socket is terminal, and nothing tells the player why

- **Where:** `apps/server/src/websockets/websockets.gateway.ts:96-103` - a new
  connection for an account disconnects the previous ones, and the comment at
  :99 notes this arrives as `io server disconnect`, which socket.io will not
  auto-reconnect from.
- **Why it's wrong:** any second connection for the same account (a second
  tab, a stale socket the client has not noticed) leaves the first tab dead
  with only the manual "Reconnect" banner, mid-match. Reported after a Ludo
  forfeit, where the player was already eliminated and the banner read as the
  forfeit having failed. The server's log shows the same account connecting
  five times in one session.
- **Suggested fix:** send the kicked socket a reason before disconnecting it
  (e.g. `session:replaced`) so the client can say "opened elsewhere" instead
  of offering a reconnect that will kick the other tab straight back.
