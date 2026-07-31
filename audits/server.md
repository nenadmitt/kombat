# Audit — `apps/server`

**Scope:** the NestJS monolith — the stake-pot ledger and withdrawal flow, wallet custody, game-outcome authority and settlement, auth/secrets, websocket auth, admin/test surface, and horizontal-scaling behaviour. On-chain contract findings are in [contracts.md](contracts.md); client findings in [mobile.md](mobile.md).

## Verdict

> **Terminology note.** This report says "escrow" throughout because that is
> what the code's identifiers say (`stake_escrows`, `EscrowStatus`,
> `claimStakeEscrow`) and the findings have to be actionable against real
> symbols. But **nothing is escrowed**: `MatchEscrow` and `escrow.abi.ts` were
> deleted at the pot cutover (`STAKEPOT_CLEANUP.md`). Stakes live in the pooled
> `StakePot` contract, matches settle in the off-chain ledger, and the surviving
> `stake_escrows` row is a per-room **settlement-state** record. Read every
> "escrow claim" below as "settlement-state claim". Logged in SERVER.BAI.md.


Two headline answers to what you asked:

1. **Can the pot be drained?** The on-chain path and the withdrawal path are sound — withdrawals only ever pay the caller's own server-resolved custodial wallet, deposits are idempotent on `(tx_hash, log_index)`, and match settlement is zero-sum over server-derived winner/participants/amount. **But there is one real, client-reachable drain: a settlement race in `completeMatch` that lets a sybil pair mint duplicate payouts (C-1 below). This is the most important finding in the whole audit and it is confirmed.**

2. **Is the monolith fine, or do you need to split into services?** A **single instance** of this monolith is the right call for now — the architecture is coherent, the hard invariants are enforced by Postgres and the chain, and microservices would add distributed-transaction complexity you don't need. The catch is that the design is *single-instance-correct*: several mechanisms silently fragment if you run more than one instance, especially without Redis. You don't need services; you need Redis to be mandatory and the operator-tx handling hardened before you ever run a second instance. Details in the Scalability section.

Severity summary:

> **Status (2026-07-31): C-1, H-2 and S-2 are FIXED**, along with R-4 and the
> custodial-key exposure. See "What was fixed" at the bottom. Everything else
> below still stands.

| ID | Sev | Area | One-line |
|----|-----|------|----------|
| C-1 | **Critical** ✅fixed | Money | `completeMatch` double-settle → duplicate payouts drain the pot |
| S-1 | High | Security | Test module + dev token route unauthenticated, gated only by `NODE_ENV` |
| S-2 | High ✅fixed | Security | `channel:join` performs no authorization — any match is watchable |
| H-2 | High ✅fixed | Money-integrity | Settle-vs-release window → winner paid *and* stakes refunded |
| R-1 | High | Reliability | Operator lock only cross-instance with Redis; sweepers assume otherwise |
| R-2 | High | Reliability | No tx timeout / nonce / fee management — one stuck operator tx halts all payouts |
| S-3 | Med | Security | No rate limiting anywhere |
| M-3 | Med | Integrity | DB winner record can be overwritten after settlement |
| R-3..R-6 | Med | Reliability/Scale | Faucet self-races; stranded `Funded` escrows; every job runs on every instance; participation queries don't scale |
| S-4, S-5, R-7 | Low | Security/Scale | JWT hardening; demo-login bypass; per-instance presence |

---

## Critical

### C-1 — `completeMatch` double-settle drains the pot (settlement replay)

**Confirmed** by direct trace. This is a live, single-instance, Redis-independent theft of pooled funds.

**Chain of facts (all verified):**
- `stakes.service.ts:224-277` — `completeMatch` runs under **no lock**. Its only idempotency guards are check-then-act reads: it reads `escrow.status` and returns if not `Funding`/`Funded`, but only writes `Settled` *after* `settleMatch` returns.
- `stake-pot.service.ts:354-436` — `settleMatch` gates on `roomHasEntry(manager, roomId, Capture/Release)`, a plain `countBy` (`:719-729`) with **no locking read**. The `FOR UPDATE` on balance rows (`lockBalance`, `:646-672`) happens *after* the guard.
- `stake-ledger-entry.entity.ts:18` / migration `1784300000000-CreateStakePot.ts:62` — the `(room_id, kind)` index is a plain `CREATE INDEX`, **non-unique**. The only unique index is the partial deposit key on `(tx_hash, log_index) WHERE tx_hash IS NOT NULL`; settlement rows have `tx_hash = NULL`, so nothing at the DB layer stops a second settlement's inserts.
- `battleships/battleship-match.service.ts:382-393` and `rps/rps-match.service.ts:167-176` — `forfeit` runs under the room lock but has **no `phase` guard**. Each call unconditionally re-sets `winner = opponent` and returns it; the gateway then calls `completeMatch` **outside** the lock.
- `battleship.gateway.ts:177-189` — a finished match is **deliberately left in the cache** ("The finished match stays in the cache so both players can fetch the 'over' state; its TTL handles cleanup"), and `MATCH_TTL_SECONDS = 24 * 60 * 60` (`cache/stores/cache-store.ts:116`). So `require(roomId)` keeps succeeding and forfeit stays replayable for **24 hours** after the match ends — the attacker does not need to win a tight race at the moment of the match, and can spam at leisure.

**Why it works.** Under Postgres READ COMMITTED, two overlapping `settleMatch` transactions both see `count = 0` at the guard, both pass, and both insert a full `Capture` + `Prize` set. The row locks serialize the *writes* but the second transaction re-reads the winner balance *after* the first committed and adds `payout` again — so the winner's `available` ends at `original + 2×payout` (Capture drives `locked` negative with no non-negativity check). The escrow status check in `completeMatch` is also a lock-free check-then-act, so it is not a barrier either.

**Attack (single instance, Redis on or off):**
1. Attacker controls A (creator) and B (joiner). A opens a staked Battleship or Triple Cut room for stake S; B joins; both stakes held (pot = 2S).
2. B emits the `forfeit` socket event N times in a burst. No phase guard → every call succeeds and fires `completeMatch(roomId, A, 'forfeit')` outside the lock, concurrently.
3. Several `settleMatch` transactions overlap; each extra one credits A another `payout = 2S − fee`.
4. A withdraws the inflated balance. On-chain holdings still cover it (funded by *other* users' pooled deposits), so the sweeper pays out; reconciliation later reports the ledger SHORT — after the money is gone.

**Fix (defense in depth, do all three):**
1. **The real fix — make settlement atomic at the DB layer.** At the top of the settlement transaction, do an atomic status transition: `UPDATE stake_escrows SET status = 'Settling' WHERE room_id = ? AND status IN ('Funding','Funded')` and proceed only if `affected === 1`. That single row-update is the serialization point and removes the TOCTOU. Optionally also add `UNIQUE (room_id, user_id, kind)` on the ledger so a second `Capture`/`Prize` insert conflicts and rolls back.
2. Run `completeMatch` under the same per-room cache lock the match mutations use (necessary but not sufficient without Redis in multi-instance — hence #1 is mandatory).
3. Add `if (match.phase !== 'play') return/throw` to `battleship-match.service.forfeit` and `rps-match.service.forfeit` (and Battleship's `endMatch`) to cut the concurrency at the source.

### Game-outcome authority — sound (context for C-1)

Worth stating plainly, because it bounds the blast radius: in all five games the winner is always re-derived from server-authoritative cache state under the per-room lock (`assertParticipant`/`assertTurn`, phase checks, `turnSeq` staleness guards). No gateway accepts a client-supplied winner/result/score; all whitelist-validate; dice/deck/terrain/trajectory are server-owned. A `forfeit` can only ever make your *opponent* win — a lone attacker cannot forge their own victory. Room create/join blocks self-join and double-seating, enforces one open room per user and the gateway allowlist, and stake amount/token are set only at creation. **So the money risk is not outcome forgery — it is the settlement replay in C-1.**

---

## High

### H-2 — Settle-vs-release window: winner paid *and* stakes refunded
`stakes.service.ts:249-264`; `stake-pot.service.ts:354-371, 440-447`; `games.service.ts:534-598`. The same lock-free TOCTOU as C-1, but across `completeMatch`'s two branches: `winnerUserId` → `settleMatch`, `null` → `releaseMatch`. `settleMatch` refuses if a `Release` exists and `releaseMatch` refuses if a `Capture` exists, but both are the same non-locking `countBy`. `forfeitLudoRoom`/`forfeitChromaRoom` call `completeMatch(null)` in their catch when the cached match has expired, while the socket forfeit handler on the still-cached match returns a winner → an HTTP forfeit racing a socket forfeit at the cache-TTL boundary lands one call in each branch: the winner gets the full payout **and** every participant gets their stake back. Narrower window than C-1 (needs the cache-expiry timing) but a single account suffices and the payoff is higher. **The atomic escrow-status transition in C-1 fix #1 closes this too** (a room can leave `Funded` only once, into exactly one of `Settling`/`Voiding`).

### S-1 — Test + dev endpoints unauthenticated, gated only by `NODE_ENV`
`test/test.controller.ts:13` (no guard), `app.module.ts:25` (`TestModule` imported unconditionally), `configuration.service.ts:94-95` (`IS_PRODUCTION = NODE_ENV === 'production'`, exact string), `authentication.controller.ts` request-token/test route. `POST /api/v1/test/clear-database` truncates every table and is protected only by a service-level `if (IS_PRODUCTION) throw`; `POST /authentication/request-token/test` mints a valid login token for **any email** under the same single check. Any deploy where `NODE_ENV` is unset, `staging`, `Production`, etc. (a common misconfig) exposes, unauthenticated: a full DB wipe and full account takeover of any funded user. **Fix:** don't register `TestModule` in production (`imports: [...(IS_PRODUCTION ? [] : [TestModule])]`), additionally put both routes behind `AdminTokenGuard`, and fail closed when `NODE_ENV` is unrecognized.

### S-2 — WebSocket `channel:join` (pub/sub subscription) performs no authorization

**Scope note — this is *not* about taking a seat in a game.** Two different things share the word "join," and only one is unauthorized:

- **Joining a game room (authorized ✅).** `games.service.ts:160-205` `joinRoom` rejects joining your own room, requires status `Pending`, checks the joiner's stake balance *before* flipping the room, and takes the seat with a conditional `UPDATE` so a lost race affects 0 rows instead of overwriting the winner's seat.
- **Playing (authorized ✅).** Every gameplay action goes through `loadParticipantRoom` (e.g. `battleship.gateway.ts:242-260`), which throws `You are not part of this room.` unless `participantsOf(room).includes(userId)`. An outsider cannot move, shoot, forfeit, or otherwise mutate a match.
- **Subscribing to the broadcast channel (NOT authorized ❌).** `websockets.gateway.ts:102-118` — `channel:join` calls `client.join(channelRoom(channel))` with zero membership check.

So the real gap is **passive eavesdropping, not participation**: any authenticated socket can subscribe to `game:<victimRoomId>` and receive every public broadcast for a match it isn't in (shots/moves, presence, winner, chat). `game:message` (`:126-145`) additionally lets any user append chat to an arbitrary `roomId`.

**Which room, exactly.** A client sends `channel:join { channel: "game:<roomId>" }`. `channelRoom()` makes that socket.io room `channel:game:<roomId>` — the same room `sendToChannel(gameChannel(roomId), …)` targets. So the subscriber receives that match's public event stream.

**Authenticated, but not authorized.** The connection itself is *not* open: `websockets.gateway.ts:66-88` disconnects any socket without a valid JWT, and joins `user:<sub>` from the **verified** token, never from client input. So every eavesdropper is a logged-in platform user — the gap is missing *authorization* on the subscribe, not missing authentication.

**Can a spectator cheat? No — verified per game.** No private state reaches a game channel:

| Game | On the channel (public) | Held back |
|---|---|---|
| Battleship | shot cells + hit/miss/mine, `sunkShips` (only ships that *just* sank), presence, start, ended | The opponent's un-sunk fleet is never in the payload; the private board view is fetched over HTTP behind `loadParticipantRoom` |
| Triple Cut (RPS) | `locked {userId, bothLocked}` — the *fact* of locking only; `reveal` fires **only once both are locked** | The choice itself pre-reveal — correct commit-reveal |
| Chroma | public turn payload | `changedHands` → `sendToUser(userId, hand, {cards})` — hands stay private |
| Salvo | shot results after the action | The dialled aim (sent *with* the action, per the trust-boundary rule) |
| Ludo | dice/moves — public by nature | — |

So a subscriber learns exactly the mutual-knowledge stream both players already have. There is **no hidden-information leak and therefore no cheating vector**, and collusion gains nothing (an accomplice can only relay what the player already sees). The impact is unauthorized *spectating* of private matches plus chat spam — a privacy/abuse issue, not a game-integrity one. That is why this is High-for-privacy rather than Critical.

**Fix:** require `participantsOf(room).includes(userId)` before joining a `game:*` channel, and gate `game:message` on room participation.

### R-1 — Operator lock is only cross-instance with Redis, but sweepers claim "safe on every instance"
`withdrawal.sweeper.ts:34-36` vs `cache/stores/memory.store.ts`; `chain/chain.service.ts:26-27`. Without Redis, each instance's sweeper holds its own in-memory operator lock and sends operator txns concurrently → nonce collisions → replaced/stuck txns. Money is not lost (the `processedWithdrawals` pre-check + `ALREADY_PROCESSED` handling prevent double-pay), but payouts stick and gas burns. **Fix:** hard-fail boot if `REDIS_URL` is unset in a multi-instance deploy (the `REQUIRE_REDIS` flag already noted in `SERVER.BAI.md`).

### R-2 — Operator lock TTL (120s) is shorter than the receipt wait (180s) → nonce collision even with Redis
`stake-pot-chain.service.ts:290-328` (`withdrawTo`), `chain/chain.service.ts:26-27, 134-165`.

*Correction to an earlier draft of this finding: viem's `waitForTransactionReceipt` is **not** unbounded — it defaults to `timeout = 180_000` (verified in `node_modules/viem/_cjs/actions/public/waitForTransactionReceipt.js:16`). So the await does terminate, and `sweeping` is not stuck forever, only for up to 180s. The conclusion survives for a sharper, arithmetic reason:*

`OPERATOR_LOCK_TTL_MS = 120_000` but the receipt wait runs up to **180_000ms**. On any tx that takes more than 120s to mine, **the lock expires 60 seconds before the send call gives up** — so another sweeper pass or another instance can acquire the "operator" lock and send a second operator tx while the first is still in flight, on a colliding nonce. This is a real window **even with Redis**, and it does not require multiple instances (the same instance's next sweep tick, 5s later, can do it).

Compounding it, there is no fee/nonce control: viem picks fees at send time with no bump or cancel, so an underpriced tx sits pending, holds the nonce, and blocks every subsequent withdrawal and gas top-up (shared operator key + shared lock) until manual intervention — the 180s timeout makes the *server* stop waiting, but does nothing about the tx still occupying the nonce on-chain.

**Fix:** make the lock TTL exceed the maximum receipt wait (or renew the lock while awaiting) — this alone closes the collision window; then add explicit nonce tracking + replacement (fee bump)/cancel and an alert on a stuck operator tx. Bites on a single instance.

---

## Medium

### M-3 — DB winner record can be overwritten after settlement
`db.service.ts:445-460` (`completeGameRoom` is an unconditional `UPDATE ... WHERE id = ?`, no status/winner guard) + the guardless Battleship/RPS forfeit. The winner of a finished match can call `forfeit` on themselves afterward to rewrite `game_rooms.winnerUserId` to the loser. The escrow terminal-status guard keeps the *money* with the true winner, but the room record and History feed now disagree with the ledger — corrupting audit/dispute data. **Fix:** guard `completeGameRoom` on `status != Completed` (one-shot flip) + the phase guards from C-1.

### S-3 — No rate limiting anywhere
No `ThrottlerModule`/helmet (not in `package.json`). Concrete abuse: `POST /authentication/request-token` email-bombs any address via Resend and creates a `users` row per typed email (enumeration/pollution); `exchange-token` allows unlimited brute-force of the 8-char (~41-bit) login code with no attempt counter (failed guesses don't burn it); `withdraw`, `createWallet` (triggers operator gas + faucet spend), and `createRoom` are unthrottled. 41 bits makes online brute-force impractical, but the absence of any throttle is a real defense-in-depth hole. **Fix:** global `ThrottlerModule` with tight per-IP limits on the auth routes, plus a per-token failed-attempt counter that invalidates after N misses.

### R-3 — Faucet has no lock, races itself under concurrent signups
`stake-pot-chain.service.ts:350-387` (`grantIntoPot`, deliberately not under the operator lock), fire-and-forget per new user at `wallets.service.ts:70`. Two simultaneous signups → two faucet txns (each possibly `approve` then `stake`) from the same account with viem auto-nonce → collision/dropped tx → grant fails. The per-user claim row prevents double grants but is retained on failure with no retry, so those users silently never get their bonus. **Fix:** serialize faucet sends under a dedicated `FAUCET_LOCK`, or a single-flight queue.

### R-4 — Settlement failure strands stakes with no recovery
`stakes.service.ts:224-277`; `stake.sweeper.ts:57-69` recovers only `Funding` escrows. `completeMatch` marks the room `Completed` first, then settles; if `settleMatch`/`updateStakeEscrow` throws, the escrow stays `Funded` with the stake locked while the room is `Completed`, and nothing retries (the deadline was already atomically popped). Locked stake stranded until manual fix. **Fix:** add a recovery pass for `Funded` escrows whose room is `Completed` (settle or void), and make `completeMatch` idempotent + retried.

### R-5 — Every background job runs on every instance
`pot-event.watcher.ts:55`, `reconciliation.job.ts:57`, `withdrawal.sweeper.ts:52`, `stake.sweeper.ts:45`, `game-deadline.sweeper.ts:58` — no leader election. With N instances the watcher scans the same block ranges N× (free-tier RPC exhaustion) and all write the single cursor row last-writer-wins (can bounce the cursor, forcing re-scans); reconciliation does N× holdings reads; the withdrawal/stake sweepers double-pick rows. Idempotency prevents double-effect, but it's N× wasted RPC/DB and lock contention. Only `GameDeadlineSweeper` is safe to run everywhere, and only because `popDueDeadlines` is atomic *with Redis*. **Fix:** run watcher/reconciliation/sweepers on a single leader (Postgres advisory lock or a dedicated scheduler instance), or claim rows with `FOR UPDATE SKIP LOCKED`.

### R-6 — Participation queries and admin lists don't scale
`db.service.ts`. The `(user_id = :u OR opponent_id = :u OR :u = ANY(opponent_ids))` predicate (in `findMatchTotalsForUser`, `findStakeNetByTokenForUser`, `findActiveGameRoomForParticipant`, `findCompletedGameRoomsForUser`) can't be served by any index → seq scans on a large `game_rooms`; History uses `OFFSET` paging (deep offsets slow); admin `findAllUsers`/`findActiveGameRooms` and `listPendingRooms` are unbounded. Fine now, degrades with growth. **Fix:** a `match_participants` join table (or GIN on `opponent_ids` + btree on the id columns) to make participation indexable; keyset pagination for history; paginate admin/lobby lists.

---

## Low

- **S-4 — JWT hardening.** `JWT_SECRET` presence-checked but strength never validated; default expiry 30d with no revocation; a socket authenticates once at connect and is never re-checked; `verifyAsync` doesn't pin `algorithms` (not exploitable with a symmetric secret, hardening only). Fix: enforce min secret length at boot, shorten access-token TTL + add refresh, pin `algorithms:['HS256']`, periodically re-verify long-lived sockets.
- **S-5 — Demo-login bypass.** `authentication.service.ts:35-40,82-89`: when `DEMO_LOGIN_CODE` is set, a fixed code bypasses OTP for `DEMO_LOGIN_EMAIL`. Safe only while unset in prod — ensure it never is and can't collide with a real high-value account.
- **R-7 — Per-instance presence.** `websockets.service.ts:16-47`: `onlineCounts` is a per-process Map, so admin online/active views reflect only the queried node under multi-instance. Cosmetic.
- **Admin footgun (not a vuln).** `admin.service.ts:78-86` `deleteUser` hard-deletes wallet rows — if the wallet still holds funds/pot balance, destroying the encrypted key strands them.

## Confirmed clean

No SQL injection (global `ValidationPipe`, parameterized TypeORM; the two raw `UPDATE`s use `$1/$2`; `truncateAllTables` interpolates server-controlled metadata names only). No committed secrets (`.env`/`.env.db` gitignored, only `.env.example` tracked; grep of `src` clean). No cross-user JWT minting (`sub` always set server-side from the authenticated principal). `AdminTokenGuard` is solid (min length 10, length-check before `timingSafeEqual`). Wallet custody encryption is AES-256-GCM with a validated 32-byte key. The withdrawal path's contract-level idempotency (`processedWithdrawals`) holds even under the R-1/R-2 races, so no double-pay on-chain.

## Priority order

1. **C-1** (Critical) — atomic escrow status transition + unique ledger constraint + forfeit phase guards. Live pot drain; fix first. Closes H-2 too.
2. **S-1, S-2** (High security) — don't ship the test module / dev-token route to prod and guard them; authorize `channel:join`.
3. **R-2** (High reliability) — operator tx timeout/nonce/fee handling; can halt all payouts today, even on one instance.
4. **S-3** (rate limiting), **M-3**, **R-3/R-4**.
5. Before ever running a second instance: **R-1** (make Redis mandatory), **R-5** (single leader for jobs). Before real user growth: **R-6**.

---

## What was fixed (2026-07-31)

### C-1 + H-2 — settlement can no longer double-pay

Three layers, because one alone would leave a gap:

1. **`UNIQUE (room_id, user_id, kind) WHERE room_id IS NOT NULL`** on the ledger
   (migration `1784500000000-SettlementIdempotency`). This is the actual
   guarantee: one Hold/Capture/Release per player per room, one Prize, one Fee.
   Two racing settlements can no longer both insert — the loser hits a unique
   violation and its whole transaction rolls back. Partial, so deposits and
   withdrawals keep their own `UQ_stake_ledger_deposit_tx` key.
2. **Atomic escrow claim** (`DbService.claimStakeEscrow`). `completeMatch` now
   takes the escrow from `Funding|Funded` to `SettlePending|VoidPending` with a
   conditional `UPDATE` and proceeds only if it affected one row. That single
   statement is the serialization point, and because a room can leave `Funded`
   only once *into exactly one of* the two pending states, it closes H-2's
   settle-and-void split as well as C-1's double-settle.
3. **Forfeit phase guards** on Battleship and RPS — a match already `over`
   throws `ConflictException` instead of re-deriving a winner. This cuts the
   concurrency at the source and matches the guard Ludo/Chroma already had.

**Failure handling (new R-4 coverage):** `applySettlement` hands the claim back
via `releaseStakeEscrowClaim` if the ledger work throws, so a transient DB error
can't strand a locked stake. That revert is itself guarded on the pending
statuses, so it can never drag an escrow another worker already carried to
`Settled` back to `Funded`. For the crash-between-claim-and-settle window,
`StakeSweeper` now also recovers `SettlePending`/`VoidPending` via
`StakesService.recoverSettlement`.

**Regression tests** (`stakes.service.pot.spec.ts`): eight concurrent
`completeMatch` calls must pay exactly one pot, and a settle racing a void must
produce exactly one outcome with the pot conserved. Both were **verified to fail
without the fix** and pass with it. The `DbService` test double models the
conditional UPDATE rather than stubbing it true, so it can't mask a regression.

### S-2 — game channels are now authorized

`channel:join` resolves `game:<roomId>` via the new `gameChannelRoomId` helper
and refuses unless `participantsOf(room).includes(userId)`; `game:message` gets
the same check. Non-game channels (the lobby) stay open, which is correct — it
is a public lobby. Room ids are shape-checked before hitting Postgres so a
malformed channel name misses instead of throwing. `WebsocketsModule` now
imports `DbModule` (no cycle — `DbModule` doesn't depend on websockets).

### Custodial private keys removed from the database

Verified first that nothing needed them: `decrypt()` had **no callers anywhere**,
the only use of the encryption service was `encrypt()` at wallet creation, and
`chain.service.ts:33` already documented that deposits are signed on the
device. So the column was write-only — pure liability.

Migration `1784600000000-DropWalletPrivateKeys` drops `wallets.key`;
`WalletEncryptionService` and `WalletCryptoModule` are deleted, and the now-dead
`WALLET_ENCRYPTION_KEY` requirement is gone from config and `.env.example` (it
was `getOrThrow`, so it would have blocked boot for a secret nothing used).

**The wallet row stays**, exactly as it must: `address` is what maps an on-chain
`Staked` event to a user, which is how stake-pot deposits get credited.

**Deliberate consequence:** the platform can no longer recover a player's wallet.
A user who loses the mnemonic returned at creation loses access to funds *in
their wallet* — their stake-pot balance is unaffected, since that is ledger state
keyed by address. This makes the wallet genuinely self-custodial and removes the
database as a single point of total loss. Worth stating plainly in the app's
onboarding copy, and it strengthens the case for the mobile Keychain hardening
(`mobile.md` M1) since the device is now the only copy.

### Still open — recommended next

`S-1` (don't ship the test module to prod) is now the highest-severity item
left, followed by `R-2` (operator lock TTL vs receipt timeout) and `S-3` (rate
limiting).

## Auth session hardening (2026-07-31)

Closes mobile **H3** and most of **S-4** (30-day tokens, no revocation).

**Before:** one JWT with a 30-day life, stored in plaintext AsyncStorage on the
device, with no way to revoke it.

**Now:**

- **Access token: 2 days** (`JWT_EXPIRES_IN` default `30d` -> `2d`). Still a
  stateless JWT, so it stays cheap to verify on every request and socket
  connect - it is just no longer a month-long bearer credential.
- **Refresh token: 30 days, rotating** (`REFRESH_TOKEN_EXPIRES_IN_DAYS`). New
  `refresh_tokens` table (migration `1784700000000`). Opaque 256-bit random,
  **stored only as a SHA-256 hash** - a database leak yields no usable session,
  the same reasoning as a password.
- **Single-use with reuse detection.** Every refresh revokes the token it
  consumed and issues a fresh pair. Presenting an already-revoked token means
  two parties hold it, so *every* live token for that user is revoked and both
  are forced back through email login. Revoked rows are kept rather than
  deleted precisely so that replay is distinguishable from a token that never
  existed.
- **Concurrency-safe.** `revokeRefreshToken` is a conditional UPDATE gated on
  `revoked_at IS NULL`, so two requests racing with the same token cannot both
  mint a pair - the loser is told to log in again instead of being handed a
  second live session.
- **Automatic, coalesced refresh in the client.** `ApiClient` retries a 401
  once, after rotating. The in-flight refresh is shared
  (`refreshInFlight`), because on a cold start several screens 401 at the same
  instant - without coalescing they would each spend the token and rotation
  would read the stampede as theft. A network failure during refresh does *not*
  log the user out; only the server actually rejecting the token does.
- **Logout revokes server-side**, so a stolen refresh token dies with the
  session instead of outliving it for a month.

**Endpoints:** `POST /authentication/refresh` and `POST /authentication/logout`
(both unguarded - the refresh token *is* the credential, and the access token
it replaces has usually expired by the time a client calls).

**Client storage:** the whole session moved to the Keychain / Android Keystore
(`apps/mobile/src/storage/session-keychain.ts`) with
`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, so it is excluded from backups and bound
to the device while still allowing a background refresh after reboot. A
pre-existing plaintext token is migrated once on upgrade and the old key
deleted, so the change logs nobody out.

**Tests:** `authentication.refresh.spec.ts` covers rotation, double-spend
refusal, reuse-detection revoking the whole set, only-one-winner under
concurrency, expiry, hash-at-rest, and logout. Runs against real Postgres,
since the single-use guarantee is a conditional UPDATE.

**Not addressed:** sockets still authenticate once at connect and are never
re-checked, so a live socket outlives its access token (bounded now at 2 days
instead of 30). Worth a periodic re-verify if you want revocation to reach
open connections.
