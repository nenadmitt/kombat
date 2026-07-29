# StakePot: implementation and testing plan

> **Status: implemented on `feat/stake-pot` (2026-07-30).** Phases 0-4 and 6 are
> done and verified: 89 Foundry tests, 54 jest tests, all four workspaces
> typecheck, migration up/down round-trips with no entity drift, and the app
> boots with all five `/stake-pot` routes mapped.
>
> **Deployed to Sepolia 2026-07-30.** StakePot
> `0xa3Ff9Ef44aeD74C773Cb69692f334dD3cB3AE529` (block 11378580) and a fresh
> KombatCoin `0x01a659Df789D3E433D7cdFf4CAc70596C56B03c0` (block 11378578); KC
> was redeployed because it has no mint, so the signup faucet float had to be
> positioned at genesis. `STAKE_POT_ADDRESS`, `STAKE_POT_DEPLOY_BLOCK`,
> `STAKE_FEE_BPS`, `FAUCET_KEY` and `FAUCET_GRANT_KOMBAT` are set in
> `apps/server/.env`. `STAKING_MODE` is still `escrow` - flipping it to `pot` is
> the remaining cutover step.
>
> A grant was verified end to end on Sepolia: faucet `stake(beneficiary)` ->
> `Staked` event -> DepositWatcher credited 1000 KC to the owning user's ledger
> row, reconciliation balanced.
>
> **Signup faucet** (added after the plan): every new wallet gets
> `FAUCET_GRANT_KOMBAT` KC paid *into their pot*, not their wallet, because the
> pot balance is what staking spends. It goes through the ordinary deposit path,
> so the watcher credits it with the usual idempotency and reconciliation stays
> balanced. Once per player via the unique `user_id` on `stake_pot_grants`, which
> is claimed before the transaction is sent.
>
> Deviations from the plan as written, all deliberate:
>
> - **`timestamptz` on the four new tables**, unlike the older ones. A plain
>   `timestamp` is stored UTC but parsed back as process-local time, which
>   skewed the sweeper's staleness check by the timezone offset and made every
>   in-flight withdrawal look abandoned. The cutoff also moved into SQL
>   (`findSweepableWithdrawals`). The same latent bug in the escrow sweeper is
>   logged in `bugs-and-inconsistencies/SERVER.BAI.md`.
> - **`GET /stake-pot/deposit-target` added.** The client signs its own
>   deposits, so it needs the pot and token addresses; serving them beats a
>   second copy of the deployment config in the app.
> - **One `StakePotModal` with an add/withdraw mode**, not two modals, per
>   `apps/mobile/CLAUDE.md` rule 5.
> - **`AdminTokenGuard` is now exported from `AdminModule`** so the
>   reconciliation endpoint can reuse it.
> - **Jest needs an ESM transform for `uuid`** (v14 is ESM-only and is reached
>   through `db-utils`); see `apps/server/jest.config.js`.
> - **Ledger tests run against the app's own database** (POSTGRES_* from
>   `.env`), truncating only the four stake-pot tables between cases. Start the
>   stack with `docker compose -p kombat-server up -d`: without the explicit
>   project name Compose resolves this directory to project `server`, which
>   collides with another checkout and tries to recreate its database (logged in
>   SERVER.BAI.md).
>
> One incident worth knowing about: `migration:generate` writes into
> `src/db/migrations/`, and a `start:dev` server watching that directory applies
> whatever lands there. A throwaway drift-check migration generated during this
> work was picked up that way and dropped `FK_users_referred_by` and
> `UQ_users_referral_code` on the local database before it was deleted. Both were
> restored from the canonical migration DDL. Generate scratch migrations outside
> `src/db/migrations/`, or stop the dev server first.

Replace per-match on-chain escrow (2 operator txs per staked match) with a
single pooled deposit contract (**StakePot**) plus a server-side balance
ledger. Users deposit once into the pot from their existing custodial wallet;
every stake/win/loss is a database mutation; withdrawals are operator-executed
transactions (a server-signed-permit path can come later). Per-match chain
cost drops to zero.

Decisions already made (do not re-litigate):

- The custodial wallet per user **stays exactly as it is** (server-generated,
  key AES-encrypted in Postgres, copy in the device Keychain).
- Deposits: user's wallet calls `stake(beneficiary, token, value)` on the
  StakePot contract; the server watches `Staked` events and credits
  `staked_balances`.
- Playing a staked game requires sufficient staked (pot) balance. Match
  outcomes only mutate the ledger.
- Withdrawals: **v1 is operator-executed** — the server signs and sends
  `withdrawTo`. Design the contract so a permit/claim path can be added later
  without redeploying (see §2 "future-proofing").
- The server-side code lives in a **new, self-contained `stake-pot` module**
  so it can be extracted into a standalone service later.
- Mobile: the wallet screen stays; add a "Staked" section showing the pot
  balance with Add / Withdraw actions.

Read these before starting: `CLAUDE.md` (root), `apps/server/CLAUDE.md`,
`apps/mobile/CLAUDE.md`, and `staking_improvement.md` (background analysis).

---

## Phase 0 — Solidity: `StakePot.sol`

**New file: `apps/evm-contracts/src/StakePot.sol`.** Follow `MatchEscrow.sol`
conventions exactly: OZ imports (`SafeERC20`, `Ownable`,
`ReentrancyGuardTransient`), custom errors, `NATIVE = address(0)` sentinel,
owner-managed `allowedTokens`, `onlyOperator` modifier, NatSpec with an
explicit trust-model paragraph.

### Contract spec

The contract is deliberately dumb: it is a token pool with an event log. The
server ledger is the authority on who owns what; the contract's job is (a)
attributable deposits, (b) idempotent operator withdrawals, (c) bounding what
a compromised operator key can drain per day.

Storage / admin:

- `address public operator` + `setOperator` (owner).
- `mapping(address => bool) public allowedTokens` + `setTokenAllowed` (owner).
- `bool public paused` + `setPaused` (owner) — blocks `stake*` and
  `withdrawTo` while paused. (OZ `Pausable` is fine too.)
- **Withdrawal rate limit** (the operator-compromise bound):
  `mapping(address token => uint256) public dailyWithdrawLimit` (owner-set;
  0 = unlimited), with a rolling 24h window accumulator
  (`mapping(address token => uint256) withdrawnInWindow` +
  `uint64 windowStart`; reset when `block.timestamp - windowStart >= 1 days`).
  Exceeding the limit reverts `DailyLimitExceeded(token, requested, remaining)`.

Deposits (anyone may call; `beneficiary` is whose ledger gets credited —
this keeps a future "deposit from an external wallet" flow open):

- `stake(address beneficiary, address token, uint256 value)` — ERC20 only
  (`token != NATIVE`), `safeTransferFrom(msg.sender, address(this), value)`.
  Reverts on `!allowedTokens[token]`, `value == 0`, `beneficiary == 0`.
- `stakeNative(address beneficiary)` `payable` — same checks, `msg.value > 0`,
  requires `allowedTokens[NATIVE]`.
- `stakeWithPermit(address beneficiary, address token, uint256 value, PermitSig calldata sig)`
  — EIP-2612 permit then `safeTransferFrom`, one tx for the mobile deposit
  flow. Copy the try/catch permit-front-running tolerance and the `PermitSig`
  struct verbatim from `MatchEscrow._fundWithPermit`.
- Event: `Staked(address indexed beneficiary, address indexed token, uint256 value, address sender)`.

Withdrawals (operator only, v1):

- `withdrawTo(bytes32 withdrawalId, address to, address token, uint256 value)`
  `onlyOperator nonReentrant`.
  - **Idempotent**: `mapping(bytes32 => bool) public processedWithdrawals`;
    a repeated `withdrawalId` reverts `AlreadyProcessed(withdrawalId)`. This
    is what makes the server's crash-retry loop safe (see §4 sweeper).
  - Native payout via the same `_payout` pattern as `MatchEscrow`.
  - Event: `Withdrawn(bytes32 indexed withdrawalId, address indexed to, address indexed token, uint256 value)`.
- Fee sweeps to treasury use the same `withdrawTo` (fees are just ledger
  entries; there is no on-chain fee concept).

Future-proofing (design now, implement later — leave NatSpec notes only):

- A user-claim path (`withdraw(cumulativeAmount, serverSig)` with a
  cumulative-claim pattern) can be added by contract upgrade/redeploy later;
  nothing in v1 storage blocks it.
- No per-user on-chain balances — that is deliberate; do not add them.

**Invariant to document in NatSpec and enforce in tests:** contract holdings
per token == sum of ledger (`available + locked` over all users + platform
fee account + pending withdrawals) — checked off-chain by the reconciliation
job (§4.7); the contract itself cannot know the split.

### Deploy + wiring

- `apps/evm-contracts/script/DeployStakePot.s.sol` mirroring
  `DeployMatchEscrow.s.sol` (constructor: owner, operator; then
  `setTokenAllowed` for NATIVE, KOMBAT, USDC; set `dailyWithdrawLimit`s).
- Update `apps/evm-contracts/README.md` (deployment steps, token allowlist —
  the README is referenced by `token-registry.ts` as the allowlist mirror).
- Deploy to Sepolia; record the address for `STAKE_POT_ADDRESS` env.

### Phase 0 tests (Foundry) — `apps/evm-contracts/test/StakePot.t.sol`

Match the style of `MatchEscrow.t.sol`. Cover at minimum:

1. ERC20 `stake` happy path: balances move, `Staked` emitted with correct
   beneficiary/sender; depositing **for someone else** works.
2. `stakeNative` happy path + `msg.value == 0` revert + NATIVE not allowed
   revert.
3. `stakeWithPermit`: fresh permit works in one tx; pre-consumed permit
   (front-run) still succeeds when allowance suffices (the try/catch path).
4. Reverts: token not allowlisted, zero value, zero beneficiary, paused.
5. `withdrawTo` happy path (ERC20 + native); only operator; paused revert.
6. **Idempotency**: same `withdrawalId` twice → second reverts
   `AlreadyProcessed`; different ids pay independently.
7. Daily limit: withdrawals accumulate within the window; exceeding reverts;
   window rolls over after 24h (`vm.warp`); limit 0 = unlimited;
   owner can raise/lower mid-window.
8. Reentrancy: malicious native recipient re-entering `withdrawTo` is blocked.
9. Fuzz: sequence of random stakes/withdrawals never lets contract balance go
   negative and `processedWithdrawals` never double-pays (use a handler-based
   invariant test if convenient, otherwise bounded fuzz).
10. Admin: `setOperator`/`setTokenAllowed`/`setPaused`/`setDailyWithdrawLimit`
    onlyOwner + events.

Run `forge test --gas-report` and note `stake`/`withdrawTo` gas in the PR
description.

---

## Phase 1 — `packages/core`: shared types

**Edit `packages/core/src/games/stake.types.ts`** (or a sibling
`stake-pot.types.ts` exported from the same barrel):

- `StakeAsset`, decimals, symbols, min/max: **reused unchanged.**
- New API types:

```ts
/** GET /stake-pot/balances response. */
export type StakePotBalances = {
  /** Base-unit balances keyed by asset. */
  available: Record<StakeAsset, string>;
  /** Held for in-progress staked matches. */
  locked: Record<StakeAsset, string>;
  /** Sum of withdrawal requests not yet confirmed on-chain. */
  pendingWithdrawals: Record<StakeAsset, string>;
};

export const STAKE_POT_EVENTS = {
  /** Any ledger change for this user; payload: StakePotBalances. */
  balance: 'stakepot:balance',
} as const;
```

- Keep `STAKE_EVENTS` (funding/funded/failed) — the pot flow reuses them so
  the mobile match-start sequence is untouched.

**After editing core, run `npm run build --workspace @gaming-platform/core`**
(consumed via `dist/` — see root CLAUDE.md) or server/mobile see stale types.

---

## Phase 2 — Server: the `stake-pot` module

**New directory `apps/server/src/stake-pot/`:**

```
stake-pot/
  stake-pot.module.ts        # Nest module; exports StakePotService
  stake-pot.service.ts       # the ledger: all balance math, DB txs
  stake-pot.controller.ts    # REST: balances, withdraw, history
  stake-pot-chain.service.ts # viem: contract reads/writes, operator signing
  stake-pot.abi.ts           # hand-kept ABI mirror of StakePot.sol
  deposit.watcher.ts         # polls Staked events -> credits ledger
  withdrawal.sweeper.ts      # drains pending withdrawal rows -> withdrawTo
  reconciliation.job.ts      # ledger-vs-chain drift check
  entities/
    staked-balance.entity.ts
    stake-ledger-entry.entity.ts
    stake-pot-withdrawal.entity.ts
    stake-pot-cursor.entity.ts
  dto/
    withdraw.dto.ts
```

### Extraction boundary (why this module bends the DbService rule)

`DbService` is documented as the sole DB contact point, but this module is
required to be extractable as its own service. **Deliberate deviation,
scoped**: the module owns its four entities and accesses them via its own
`TypeOrmModule.forFeature([...])` repositories + `DataSource` transactions —
it never touches other modules' tables directly. The only inbound facts it
needs are provided via small injected lookups:

- user → wallet address / address → user: inject `DbService` **only** for
  `findWalletsForUser` / a new `findWalletByAddress` (add to DbService).
  When extracted, these become an RPC/HTTP lookup — keep them behind two
  private methods so the seam is one file.
- Outbound: `WebsocketsService.sendToUser` for balance pushes,
  `ConfigurationService` for env.

Games code consumes **only** the exported `StakePotService` public API
(below). Nothing in `stake-pot/` may import from `games/`.

Register the four entities in both lists in
`apps/server/src/db/db.module.ts` (`entities:` array and `forFeature`) —
the datasource glob for migrations picks entity files by path, so also make
sure `apps/server/src/configuration/datasource.ts`'s `entities` glob covers
`stake-pot/entities/*.entity.{ts,js}` (it currently only globs
`db/entities/`). Import `StakePotModule` in `app.module.ts` and in
`games.module.ts`.

### Entities

`staked_balances` — one row per (user, asset), **created lazily on first
credit**:

| column | type | notes |
| --- | --- | --- |
| user_id | uuid, indexed | plain column, no FK (matches `GameRoomEntity.userId` convention). The platform fee account is the constant uuid `00000000-0000-0000-0000-00000000fee5` (`PLATFORM_ACCOUNT_ID` in `stake-pot.service.ts`). |
| asset | smallint | `StakeAsset` |
| available | numeric(78,0) | spendable |
| locked | numeric(78,0) | held by in-progress matches |
| created_at / updated_at | | |
| | | unique index (user_id, asset) |

`stake_ledger_entries` — append-only journal, one row per movement. Never
UPDATE or DELETE rows here.

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| user_id | uuid, indexed | |
| asset | smallint | |
| kind | smallint enum | `Deposit, Hold, Capture, Release, Prize, Fee, WithdrawalRequest, WithdrawalRefund` |
| amount | numeric(78,0) | signed: credit +, debit − (against `available`; Hold is − available / + locked, Release the inverse, Capture is − locked) |
| room_id | uuid nullable, indexed | for Hold/Capture/Release/Prize/Fee |
| tx_hash | varchar nullable | deposit tx |
| log_index | int nullable | |
| withdrawal_id | uuid nullable | |
| balance_after | numeric(78,0) | available after applying — makes audits trivial |
| created_at | | |
| | | **unique index (tx_hash, log_index) where tx_hash is not null** — the deposit idempotency key |

`stake_pot_withdrawals` — work queue, same philosophy as `stake_escrows`:

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | doubles as the on-chain `withdrawalId` (`bytes32` = uuid left-padded; helper in chain service) |
| user_id, asset, amount | | |
| to_address | varchar | **always the user's registered wallet address**, resolved server-side at request time — never client-supplied |
| status | smallint | `Pending=0, Sent=1, Confirmed=2, Failed=3` |
| tx_hash | varchar nullable | |
| attempts | smallint default 0 | |
| error | varchar nullable | |
| created_at / updated_at | | index (status, updated_at) for the sweeper scan |

`stake_pot_cursor` — single row: `id=1, last_scanned_block bigint`.

**Migration**: one new migration
`apps/server/src/db/migrations/1784300000000-CreateStakePot.ts` following the
existing hand-written style (see `1784100000000-AddLobbyRoomIndex.ts`), with
a full `down()`.

### `StakePotService` — the ledger (public API consumed by games + controller)

Every method below runs in **one Postgres transaction with
`SELECT … FOR UPDATE` on the touched `staked_balances` rows** (lock rows in a
canonical order — sort by user_id — to avoid deadlocks). Redis cache locks
are for match state, not money; do not use them here.

```ts
availableBalance(userId, asset): Promise<bigint>
getBalances(userId): Promise<StakePotBalances>

/** Deposit credit; no-throw idempotent via (txHash, logIndex) unique key. */
credit(userId, asset, amount, { txHash, logIndex }): Promise<void>

/**
 * Hold every participant's stake for a filled room, atomically: all
 * holds succeed or the whole tx rolls back and the caller voids the room.
 * Idempotent per (roomId, userId) — re-entry (crash replay) must not
 * double-hold: skip users that already have a Hold entry for this room.
 */
holdForMatch(roomId, userIds, asset, amount): Promise<void>

/**
 * Terminal settlement, one DB tx: capture all holds, credit winner
 * pot − fee (Prize), credit PLATFORM_ACCOUNT_ID the fee (Fee).
 * fee = pot * STAKE_FEE_BPS / 10_000. Idempotent per roomId (skip if a
 * Capture entry for roomId exists).
 */
settleMatch(roomId, winnerUserId, userIds, asset, amount): Promise<void>

/** Void: release every hold for roomId back to available. Idempotent. */
releaseMatch(roomId): Promise<void>

/** Withdrawal request: debit available, insert Pending row. Throws on
 *  insufficient available. Returns the withdrawal id. */
requestWithdrawal(userId, asset, amount): Promise<string>

/** Sweeper callbacks: markSent / markConfirmed / markFailed(+refund). */
```

After every mutating call, push `STAKE_POT_EVENTS.balance` with fresh
`getBalances(userId)` to each affected user via
`WebsocketsService.sendToUser`.

Amount hygiene: amounts cross the wire as base-unit decimal strings
(validated `/^\d+$/`), stored as `numeric(78,0)`, handled as `bigint` in TS.
Never `parseFloat`.

### `StakePotChainService`

Mirrors `ChainService`'s structure (viem, `enabled` flag pattern —
enabled iff `CHAIN_RPC_URL && STAKE_POT_ADDRESS && OPERATOR_PRIVATE_KEY` and
the token registry has the chain):

- `getStakedEvents(fromBlock, toBlock)`: `publicClient.getLogs` on the
  `Staked` event.
- `withdrawTo(withdrawalId, to, asset, amount)`: operator write. Reuse the
  existing `chain:operator` Redis lock from `ChainService` (import the same
  key constant — one nonce stream for the operator key, shared across both
  services until MatchEscrow retires).
- `isWithdrawalProcessed(withdrawalId)`: read `processedWithdrawals` — the
  sweeper's crash-recovery check.
- `getPotHoldings(asset)`: contract balance (for reconciliation).
- `getLatestBlock()`.
- `uuidToBytes32(uuid)` helper.

**`stake-pot.abi.ts`**: hand-kept mirror of `StakePot.sol` (same convention
as `chain/escrow.abi.ts` — note in the header that it must stay in sync).

### `DepositWatcher`

`OnModuleInit` interval (env `STAKE_POT_POLL_MS`, default 5000), same
`sweeping`-flag re-entrancy guard as `StakeSweeper`:

1. `from = cursor.last_scanned_block + 1`,
   `to = latestBlock - CHAIN_CONFIRMATIONS` (confirmation lag is the reorg
   guard). If `from > to`, skip.
2. Chunk the range (max 2000 blocks per `getLogs` call — free-tier RPC
   limits) and fetch `Staked` logs.
3. For each log: resolve `beneficiary` → user via wallet address. Unknown
   address → `logger.warn` and skip (reconciliation will surface the drift;
   the funds sit unattributed in the pot — an admin credit tool is out of
   scope for v1, note it in the PR).
4. `credit(...)` — the (tx_hash, log_index) unique key makes replays no-ops.
5. Advance the cursor **only after** every log in the range is processed
   (cursor update in the same DB tx as the last batch is unnecessary —
   idempotent credits make a stale cursor safe, just wasteful).
6. First boot (no cursor row): initialize `last_scanned_block` to the
   current latest block (env `STAKE_POT_DEPLOY_BLOCK` overrides for
   backfill).

### `WithdrawalSweeper`

Interval sweeper over `stake_pot_withdrawals`, chain-state-first (same
philosophy as `stake.sweeper.ts`):

- `Pending` rows: **first** check `isWithdrawalProcessed(id)` — if true, a
  previous run died between tx send and DB write; mark Confirmed. Otherwise
  send `withdrawTo`, mark Sent(tx_hash), wait receipt, mark Confirmed.
- `Sent` rows older than a stale window: re-check receipt by tx_hash, else
  re-check `isWithdrawalProcessed` and resend if false (the contract's
  idempotency makes an over-eager resend revert harmlessly with
  `AlreadyProcessed` — treat that revert as Confirmed).
- On failure: attempts + 1; after `MAX_ATTEMPTS` (3) mark Failed **and
  refund**: `markFailed` re-credits `available` with a `WithdrawalRefund`
  ledger entry. Failed is terminal-with-money-returned, unlike the escrow's
  Failed.
- Push the balance socket event on Confirmed/Failed.

### `ReconciliationJob`

Every `STAKE_POT_RECONCILE_MS` (default 10 min): per asset, assert

```
contractHoldings == Σ available + Σ locked (all users incl. PLATFORM_ACCOUNT_ID)
                    + Σ amount of Pending/Sent withdrawals
```

Tolerate a small transient window (deposits inside the confirmation lag);
on persistent drift `logger.error` with the per-asset delta. Expose
`GET /stake-pot/admin/reconciliation` (guard: reuse whatever `admin/` uses)
returning the latest snapshot.

### Controller (REST, JWT-guarded like `wallets.controller.ts`)

- `GET /stake-pot/balances` → `StakePotBalances` (503 when chain disabled,
  mirroring the wallets controller).
- `POST /stake-pot/withdraw` `{ asset, amount }` (DTO: `@IsEnum(StakeAsset)`,
  amount `/^\d+$/`) → `{ withdrawalId }`. Destination is always the caller's
  registered wallet.
- `GET /stake-pot/history?limit=` → recent ledger entries for the caller
  (kind, asset, amount, roomId, txHash, createdAt) — feeds the mobile
  activity list later; cheap to include now.

### Config (`configuration.service.ts` + `.env.example` if present)

| env | default | |
| --- | --- | --- |
| `STAKE_POT_ADDRESS` | — | enables pot mode infra |
| `STAKE_FEE_BPS` | `500` | ledger fee on settlement; validate ≤ 1000 to mirror `MAX_FEE_BPS` |
| `STAKE_POT_POLL_MS` | `5000` | deposit watcher |
| `STAKE_POT_DEPLOY_BLOCK` | — | watcher backfill start |
| `STAKE_POT_RECONCILE_MS` | `600000` | |
| `STAKING_MODE` | `escrow` | `escrow` \| `pot` — see §5 cutover |

---

## Phase 3 — Games integration (`games/stakes/stakes.service.ts`)

Keep `StakesService` as the games-side seam; it now delegates to
`StakePotService` when `STAKING_MODE=pot`. The gateways, `completeMatch`
funnel, event names, and `assertRoomPlayable` gate all keep their signatures
— only internals change. Branch on mode inside `StakesService` so the old
path stays runnable during cutover (§5).

- `enabled`: pot mode → `stakePotChainService.enabled`.
- `validateStake`: unchanged (bounds are asset-level).
- `assertSufficientBalance`: pot mode → `availableBalance(userId, asset) >=
  amount`. No RPC, no `NATIVE_GAS_HEADROOM` (gas is irrelevant to pot
  stakes). This kills the TOCTOU race: the authoritative check is the hold
  itself.
- `beginFunding(room)`: pot mode becomes **synchronous**:
  1. Emit `STAKE_EVENTS.funding` (keep — mobile expects the sequence).
  2. `holdForMatch(roomId, participantsOf(room), asset, amount)` in-line.
  3. Success → same success block as today verbatim: create/flip nothing
     extra, emit `STAKE_EVENTS.funded`, then the per-shape
     `ROOM_EVENTS.started` / `ROOM_EVENTS.opponentJoined` pushes. **Do not
     reorder or merge these events** — the mobile overlay/navigation
     serialization depends on them (see `apps/server/CLAUDE.md`, "Events that
     move the client between screens").
  4. Hold failure (someone withdrew between the join check and the hold) →
     reuse the existing failure path: complete room `stake-failed`, emit
     `STAKE_EVENTS.failed`, release any holds that did land
     (`releaseMatch` — the hold tx is atomic, so normally none).
  - The `stake_escrows` row: in pot mode **still create one** with
    `matchId = matchIdFor(roomId)` and drive it straight to `Funded` (no tx
    hashes). Rationale: `assertRoomPlayable` and the history queries read it;
    keeping the row costs one insert and avoids touching read paths. The
    funding-orphan branch of `StakeSweeper` never sees pot rows because they
    are never left in `Funding`.
- `completeMatch(roomId, winnerUserId, endReason)`: pot mode — after
  `completeGameRoom`, run `settleMatch` (winner) or `releaseMatch` (void)
  **synchronously**, then set the escrow row to `Settled`/`Voided` with
  `payout`/`fee` (same fields the history queries already read — this keeps
  `findStakeNetByTokenForUser` and `MatchHistoryEntry.prizeDelta` correct
  with zero query changes). No `SettlePending`/`VoidPending` states in pot
  mode; the `StakeSweeper` has nothing to do for pot rooms.
- Multi-seat (Ludo) rooms: nothing special — holds are placed for every
  participant at `beginFunding` (called from both the fill and start-early
  paths in `games.service.ts:206,349`), eliminations don't move money, and
  `completeMatch` pays the last stander the whole pot − fee, exactly like
  the escrow did.
- `wallets.service.ts#createWallet`: in pot mode skip
  `prepareWalletForStaking` (escrow approvals are pointless); keep a plain
  gas dust (`ensureGasFor`-equivalent, exposed via a small public method on
  `ChainService`) so a fresh wallet can afford its first deposit tx.

---

## Phase 4 — Mobile (`apps/mobile`)

Follow `apps/mobile/CLAUDE.md` conventions for all UI work. Server API base:
the existing `api/client.ts`.

New store: `src/store/stakePot.store.ts` (zustand, mirror
`walletBalances.store.ts` shape): `balances: StakePotBalances | null`,
`refresh()` calling `GET /stake-pot/balances`, plus a socket subscription for
`STAKE_POT_EVENTS.balance` (wire it where other `stake:*` events are handled
— see `websocket.store.ts`) that replaces the snapshot.

`WalletScreen.tsx`: add a **Staked** card between the balance header and the
token list:

- Per-asset staked amount (`available`, with `locked` shown as "in play"
  and pending withdrawals as "withdrawing…"), formatted via
  `formatStakeAmount`.
- Two actions: **Add** and **Withdraw**.

`src/components/wallet/AddToPotModal.tsx` (pattern-match `WithdrawModal.tsx`
for layout/validation):

- Asset picker (ETH / KOMBAT / USDC) + amount, validated with
  `parseStakeAmount`, max = on-chain wallet balance (minus a gas headroom
  for ETH).
- Signs **client-side with the Keychain key** (reuse the
  `wallet/transfer.ts` pattern):
  - ERC20: sign EIP-2612 permit locally, single `stakeWithPermit` tx.
  - ETH: `stakeNative(ownAddress)` with value.
  - The StakePot address/ABI: add to `src/wallet/` config alongside the
    existing chain/token constants (`chains.ts` / `tokens.ts`).
- After broadcast: optimistic "pending" row in the staked card; the
  `stakepot:balance` push (watcher credit) resolves it. Show "credited after
  N confirmations" copy.
- Refresh the regular wallet balance store afterwards (funds left the
  wallet).

`src/components/wallet/WithdrawFromPotModal.tsx`:

- Asset + amount, max = `available`.
- `POST /stake-pot/withdraw`; destination is implicit (own wallet) — say so
  in the UI.
- Pending state until the balance push confirms; on Failed show the refund
  ("withdrawal failed, funds returned to your pot").

Staked-game UX:

- Lobby / create-room / join screens: no change to the stake flow, but the
  insufficient-balance error now means "pot balance" — update copy where the
  error is surfaced, and deep-link the error state to the wallet screen's
  Add flow ("Top up your stake pot").
- `StakeFundingOverlay` stays as-is: in pot mode `stake:funding` →
  `stake:funded` arrive back-to-back so it flashes at most briefly. Do not
  remove it in this PR (it still serves escrow mode during cutover).
- Match result screen: trigger `stakePot.store.refresh()` so the win shows
  immediately.

---

## Phase 5 — Cutover / migration

1. Ship everything with `STAKING_MODE=escrow` (default). Pot infra
   (watcher/sweeper/reconciliation) boots whenever `STAKE_POT_ADDRESS` is
   set, so deposits can accumulate before the flip.
2. Deploy StakePot to Sepolia, set `STAKE_POT_ADDRESS`, mobile release with
   the Staked card — users can start depositing while matches still run on
   escrow.
3. Flip `STAKING_MODE=pot`. New staked rooms now hold-from-pot. In-flight
   escrow matches drain through the untouched `StakeSweeper`; the flag keeps
   both paths alive.
4. After the last escrow row is terminal (`SELECT count(*) FROM
   stake_escrows WHERE status IN (0,2,4)` = 0), the escrow path is dead code
   — remove per `STAKEPOT_CLEANUP.md` (separate PR).
5. Rollback path: flip back to `escrow` — pot balances are untouched; only
   `beginFunding`/`completeMatch` branch on the flag at call time.

---

## Phase 6 — Server testing

There is currently **no JS test infrastructure in the repo** (no jest/vitest
anywhere, no `test` script). Set it up as part of this work:

- Add jest + ts-jest (standard Nest setup) to `apps/server`, `"test"` script,
  and a turbo `test` task at the root.
- Ledger tests run against **real Postgres** (the row-locking semantics are
  the point; sqlite would test nothing). Reuse
  `apps/server/docker-compose.yaml` Postgres with a dedicated
  `POSTGRES_DB=gaming_test`; a small test harness boots a `DataSource` with
  the entities + migrations and truncates between tests (the repo already
  has a truncate helper pattern in `db.service.ts` around line 580 — reuse
  it).
- Chain-facing services are tested with a **mocked viem client** (inject
  fakes for `getLogs`/`readContract`/`writeContract`); no anvil dependency
  in CI for v1 (nice-to-have later).

### Unit/integration cases (the money-correctness bar is the release gate)

`StakePotService` (real Postgres):

1. credit → available grows; `balance_after` chain in the journal is
   consistent.
2. **Deposit idempotency**: same (tx_hash, log_index) credited twice →
   second is a no-op, journal has one row.
3. holdForMatch happy path (2p and 4p): available→locked for every player;
   re-run (crash replay) doesn't double-hold.
4. holdForMatch with one broke participant → whole tx rolls back, nobody's
   balance moved.
5. **Concurrency**: two simultaneous holds against one user whose balance
   covers only one (two parallel DataSource txs) → exactly one succeeds.
   Same test for concurrent withdraw-vs-hold.
6. settleMatch: winner gets pot−fee, fee lands on PLATFORM_ACCOUNT_ID,
   losers' locked burned; fee math vs `STAKE_FEE_BPS` including rounding
   (integer division dust stays with... verify: pot−fee to winner, fee to
   platform — sums exactly to pot). Idempotent on re-run.
7. releaseMatch: all holds return; idempotent; mixed with settle (settle
   then release is a no-op and vice versa).
8. requestWithdrawal: insufficient available throws; available debited;
   locked untouched; **cannot withdraw locked funds**.
9. Withdrawal lifecycle: Pending→Sent→Confirmed; Failed → refund entry and
   available restored.
10. Balance socket push emitted per affected user per mutation (spy on
    WebsocketsService).

`DepositWatcher` (mock chain):

11. Credits each log once; cursor advances; confirmation lag respected
    (logs above `latest - confirmations` are not read).
12. Restart replay: cursor behind, logs re-fetched → no double credits.
13. Unknown beneficiary address → skipped with warning, cursor still
    advances.
14. RPC throws → sweep aborts cleanly, cursor unchanged, next tick retries.

`WithdrawalSweeper` (mock chain):

15. Pending → sends withdrawTo with uuid→bytes32 id, Confirmed on receipt.
16. **Crash between send and DB write**: Pending row +
    `isWithdrawalProcessed=true` → marked Confirmed without resending.
17. `AlreadyProcessed` revert on resend → treated as Confirmed.
18. MAX_ATTEMPTS failures → Failed + refunded exactly once.

`StakesService` in pot mode (real Postgres + mocked chain):

19. Full staked 2-player flow: join → funding+funded+opponentJoined emitted
    in the same order as escrow mode; escrow row lands `Funded`;
    completeMatch → winner credited, escrow row `Settled` with payout/fee →
    `findStakeNetByTokenForUser` and match history return the same shapes as
    escrow mode.
20. Void flow (stake-failed / no-winner) → releases, escrow row `Voided`,
    history shows void with zero net.
21. Ludo 4-player: 4 holds, one winner takes 4×stake−fee.
22. Broke joiner rejected before seating (`assertSufficientBalance` on pot).

Reconciliation:

23. Seeded drift (manual UPDATE on a balance) → job reports the exact
    per-asset delta; clean state reports zero.

### Manual E2E checklist (Sepolia, staging env + real device/simulator)

- [ ] Deposit ETH and USDC from the app; staked card shows pending → credited.
- [ ] Deposit from an *external* wallet with `stake(beneficiary=own custodial address)` → credited.
- [ ] Create + join a staked room in pot mode; overlay flashes; match starts
      with no chain tx (check operator address nonce unchanged).
- [ ] Win a staked match → staked balance up by pot−fee immediately on the
      result screen.
- [ ] Forfeit and triple-timeout paths settle correctly.
- [ ] Kill the server mid-match → restart → match resolves via deadline
      sweeper → ledger settles once.
- [ ] Withdraw: request → on-chain tx → wallet balance up; pot pending state
      correct throughout; try withdrawing more than available (rejected) and
      exactly `available` (works).
- [ ] Stop the withdrawal sweeper, request a withdrawal, kill/restart server,
      confirm exactly-once payout.
- [ ] Flip `STAKING_MODE` back to `escrow` and play one staked match
      end-to-end (rollback path stays alive).
- [ ] Reconciliation endpoint shows zero drift after all of the above.

---

## Suggested implementation order (each step compiles + passes tests)

1. Phase 0 contract + Foundry tests + deploy script.
2. Phase 1 core types (+ core build).
3. Jest infra + Phase 2 entities/migration + `StakePotService` + its tests.
4. Chain service + ABI mirror + watcher + withdrawal sweeper + their tests.
5. Controller + reconciliation.
6. Phase 3 games integration behind `STAKING_MODE` + integration tests.
7. Phase 4 mobile.
8. Phase 5 staging cutover + manual checklist.

Estimate (one dev, includes tests): contract 1–2 d; core+jest infra 1 d;
ledger 2–3 d; watcher/sweeper/reconciliation 2–3 d; games integration 1–2 d;
mobile 2–3 d; staging drills 1–2 d ≈ **10–16 days**.

## Explicitly out of scope (do not build now)

- Server-signed permit withdrawals (cumulative-claim pattern) — the v1
  contract must not block it, nothing more.
- Escape hatch / force-withdraw for a dark server (document the custody
  trade-off in the contract NatSpec; fine for Sepolia play-money).
- Admin tool for unattributed deposits; deposit backfill UI.
- Removing the escrow path — tracked in `STAKEPOT_CLEANUP.md`, separate PR
  after drain.
