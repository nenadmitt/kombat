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

## 2026-07-31 — Test module ships to production, gated only by an exact `NODE_ENV` string

- **Where:** `apps/server/src/app.module.ts:25` (`TestModule` imported
  unconditionally), `apps/server/src/test/test.controller.ts:13` (no guard on
  `POST /api/v1/test/clear-database`), `apps/server/src/test/test.service.ts:23`,
  and the dev token route in `authentication.controller.ts` /
  `authentication.service.ts`. Both rely on
  `configuration.service.ts:94` — `IS_PRODUCTION = NODE_ENV === 'production'`.
- **Why it's wrong:** the only thing between the public internet and a full
  `TRUNCATE` of every table — plus a route that mints a valid login token for
  any email address, i.e. takeover of any funded account — is one env var
  matching one exact string. `NODE_ENV` unset, `staging`, or `Production`
  (capital P) opens both, unauthenticated. A single deploy typo is a total
  data-loss and account-takeover event.
- **Suggested fix:** don't register the module at all in production
  (`imports: [...(IS_PRODUCTION ? [] : [TestModule])]`), *and* put both routes
  behind `AdminTokenGuard` as defence in depth, *and* fail closed when
  `NODE_ENV` is an unrecognised value rather than treating it as non-production.
  Found during the 2026-07-31 audit; see `audits/server.md` S-1.

## 2026-07-31 — Operator lock TTL (120s) is shorter than the receipt wait (180s)

- **Where:** `apps/server/src/chain/chain.service.ts:27`
  (`OPERATOR_LOCK_TTL_MS = 120_000`) vs
  `apps/server/src/stake-pot/stake-pot-chain.service.ts:318`
  (`waitForTransactionReceipt` with no `timeout`, so viem's default of
  180_000 applies — verified in
  `node_modules/viem/_cjs/actions/public/waitForTransactionReceipt.js:16`).
- **Why it's wrong:** on any operator transaction that takes over two minutes
  to mine, the lock expires a full 60 seconds before the send call gives up.
  The next sweep tick (5s later) can then acquire the "operator" lock and send
  a second transaction on a colliding nonce while the first is still in flight.
  This needs neither multiple instances nor a missing Redis. Compounding it,
  there is no fee bump or cancel, so an underpriced transaction holds the nonce
  and blocks every subsequent withdrawal and gas top-up.
- **Suggested fix:** make the lock TTL exceed the maximum receipt wait (or renew
  the lock while awaiting) — that alone closes the collision window. Then add
  explicit nonce tracking with replacement/cancel, and alert on a stuck operator
  transaction. Found during the 2026-07-31 audit; see `audits/server.md` R-2.

## 2026-07-31 — `completeGameRoom` can overwrite the winner of a settled match

- **Where:** `apps/server/src/db/db.service.ts:445-460` — an unconditional
  `UPDATE ... WHERE id = ?` with no status or winner guard.
- **Why it's wrong:** combined with a forfeit arriving after a match is already
  over, the true winner's own client can rewrite `game_rooms.winnerUserId` to
  the loser. The settlement row's terminal-status guard keeps the *money* correct, but
  the room record and the History feed then disagree with the ledger, which
  corrupts audit and any future dispute logic that trusts the room row.
  (The Battleship/RPS forfeit phase guards added on 2026-07-31 close the
  currently-known trigger, but the unconditional write is the underlying bug.)
- **Suggested fix:** guard the update on `status != Completed` so the flip is
  one-shot. Found during the 2026-07-31 audit; see `audits/server.md` M-3.

## 2026-07-31 — A funded room nobody ever enters strands every player's stake forever

- **Where:** `apps/server/src/games/battleships/battleship-match.service.ts:97`
  (`getOrCreate` — the match, and with it the first deadline at `:134`, is
  created **lazily on `enter`**), versus
  `apps/server/src/games/stakes/stakes.service.ts:124` (`beginFunding` holds
  every stake during the HTTP join, before anyone has entered). Same shape in
  the other four games.
- **Why it's wrong:** stakes move `available -> locked` the moment the room
  fills, but nothing is scheduled to end the match until a player calls `enter`.
  If both players close the app in that window — between the join completing and
  either client reaching the match screen — no match exists in the cache, so no
  deadline is ever armed, no timeout can fire, and `completeMatch` is never
  reached. The settlement row sits in `Funded` and the stakes stay locked with no
  recovery path: `StakeSweeper` scans `Funding`, `SettlePending` and
  `VoidPending`, never `Funded`, and nothing sweeps stale `InProgress` rooms.
  Discovered while tracing "what happens when both players leave" — every other
  abandonment case self-resolves via the turn clock, this one does not.
- **Suggested fix:** arm a start deadline at funding time rather than at first
  `enter` (a room that is never entered then voids and refunds on its own), or
  extend `StakeSweeper` to void `Funded` settlements whose room has been
  `InProgress` past a generous cutoff with no match in the cache. Evaluate any
  such cutoff in SQL rather than against `Date.now()`.

## 2026-07-31 — Triple Cut awards the pot to the joiner when *both* players abandon

- **Where:** `apps/server/src/games/rps/rps-match.service.ts:142-157`.
  `timeoutRound` increments a timeout for **every** player who didn't lock, so a
  doubly-abandoned match caps both players on the same round. The winner is then
  `opponentOf(match.players.find(p => timeouts[p] >= MAX_TIMEOUTS))`, and
  `find` returns the first match in `players`, which is `[creator, opponent]`
  (`:31`, `:74`).
- **Why it's wrong:** with both players equally absent and identically capped,
  the creator is always declared the loser and the joiner always takes the pot
  minus fee. The outcome is decided by seat index, not by anything either player
  did. Compare Battleship's setup timeout
  (`battleship-match.service.ts:407-421`), which correctly voids to a null
  winner when *neither* player acted — that is the intended treatment of a
  mutual no-show, and the refund path already exists.
- **Suggested fix:** when more than one player is capped in the same resolution,
  end with a null winner so `completeMatch(null)` releases every hold, matching
  the Battleship setup-timeout behaviour.

## 2026-08-01 - `channel:join` refuses silently, so a client cannot tell it is unsubscribed

- **Where:** `apps/server/src/websockets/websockets.gateway.ts:118-133`.
  `handleJoinChannel` calls `mayJoin` (`:135-148`) and simply `return`s when it
  is false. Nothing is emitted back, and the handler sends no ack on the
  success path either.
- **Why it's wrong:** a refused subscriber and a subscribed one are
  indistinguishable from the client's side - both see silence. The same is true
  of the gap before the `await` completes, since `mayJoin` hits
  `findGameRoomById` for a game channel. `websocket.store.ts:83-86` fires
  `channel:join` and returns immediately, so the mobile client treats the
  channel as joined the moment it emits. Every other gateway in the app already
  reports failure to the caller (`battleship.gateway.ts:emitError` ->
  `battleship:error`), so this is the one client-facing handler that fails
  invisibly. Impact is currently limited because game screens re-sync from
  `GET /games/rooms/:id/state`, not because the subscription is reliable.
- **Suggested fix:** emit a `channel:error` (or reuse the per-game error event)
  when `mayJoin` is false, and return a value from the handler so socket.io
  acks the client that asked for one. That also removes the need for
  fixed sleeps after `channel:join` in the e2e suite
  (`apps/server/test/room-lifecycle.e2e-spec.ts`).
