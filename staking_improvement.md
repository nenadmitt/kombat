# Staking architecture: from per-match on-chain escrow to a server ledger

Investigation of the two proposed models — (1) an on-chain staking vault with
server-side match state, (2) full CEX-style custody with an off-chain ledger —
against what the codebase actually does today. Recommendation and effort
estimate at the end.

## 1. What we actually have today

### Custody reality: the platform is already custodial

The "user controls the wallet" framing is only half true. The server
**generates** every wallet, stores the private key AES-256-GCM-encrypted in
Postgres under a single env master key, and **routinely decrypts it to sign
transactions as the player** — ERC20 approves, EIP-2612 permits, and native
`fundNative` stakes all happen server-side with the user's key
(`apps/server/src/wallets/wallets.service.ts#createWallet`,
`apps/server/src/chain/chain.service.ts#playerAccount`, `#fundNativeAs`).
The mobile app keeps a second copy of the same key in the Keychain, used only
for user-initiated outbound transfers (`apps/mobile/src/wallet/transfer.ts`).
The client never signs a staking transaction; staking is pure REST + socket
events from its point of view.

So the trust model is already: **server = custodian and signer for everyone**.
Neither proposed option gives up user control that actually exists today —
they only change *where the money sits between matches*.

### On-chain cost per staked match (the thing both options eliminate)

| Path | Txs per match | Notes |
| --- | --- | --- |
| ERC20 (KOMBAT/USDC), steady state | **2** — `openWithApprovals` + `settleStake`/`voidStake` | operator signs & pays both |
| ERC20, allowance short | +1 `approve` per affected player (+ gas dust tx) | server signs as player |
| Native ETH, 2-player | **4** — `createMatch` + 2× `fundNative` + settle/void | player wallets pay their own gas |
| One-time per new wallet | 1 gas dust + 2 `approve`s | pre-approval at wallet creation |

Every tx is awaited to receipt **serially** under a single global
`chain:operator` lock before the match can start. Players sit behind the
`StakeFundingOverlay` ("Bribing the referee…") for the sum of those waits,
with no timeout, progress, or cancel path.

### Friction this causes (all verified in code)

- **Match start blocks on L1 latency.** `fundRoom` confirms every tx before
  emitting `stake:funded`; the joke overlay assumes "a couple of seconds" and
  has no timeout branch — if neither `stake:funded` nor `stake:failed`
  arrives, the user is stuck.
- **Concurrency is nearly zero.** The operator lock is held through
  confirmation, but lock acquisition gives up after ~1.25 s — a second
  concurrent staked match burns a funding attempt on `ConflictException`
  (3 attempts → the match is voided). Logged in `SERVER.BAI.md`.
- **No nonce management.** A tx stuck >120 s outlives the operator lock and
  the next call collides on the nonce. No gas bump, no replace, no timeout on
  the receipt wait. Logged in `SERVER.BAI.md`.
- **TOCTOU on balances.** Stake eligibility is a live RPC balance read at
  join; the user holds the same key in their pocket and can move the funds
  before funding lands. No hold/reservation exists because **there is no
  off-chain ledger at all** — no balances table, no journal, no
  deposit/withdraw endpoints. `stake_escrows` (per-room) is the only money
  audit trail.
- **Settlement is invisible.** Wins queue `SettlePending` for a 5 s sweeper;
  the result screen and wallet show nothing until the tx lands and the 60 s
  balance poll catches up.
- **Every rematch pays full price again.** No pre-funded balance concept
  exists in `MatchEscrow.sol` — the only balance-like storage is the
  platform `feePot`.

## 2. Option 1 — staking vault contract, state server-side

Users (or the server, with their custodial key) deposit into a new `Vault`
contract once. Per-match stakes become ledger entries; the contract is
touched only on deposit and withdrawal, and withdrawals are operator-gated.

**What it requires**

- New Solidity contract (deposit/depositFor, operator-gated withdraw, per-user
  on-chain balance mapping, pausability), Foundry tests, deployment, and a
  hand-kept ABI mirror per the existing convention.
- Everything in the "shared core" below (the ledger is identical in both
  options).
- A deposit path: either the user's wallet calls the vault (new client-side
  signing surface that doesn't exist today), or — more consistent with the
  current UX — the server sweeps incoming funds from the user's custodial
  address into the vault via `depositFor`. Note that this means Option 1
  **still needs the sweeping infrastructure of Option 2**, just with the
  vault as destination.

**The honest caveat about its trust value**

The vault's appeal is "funds provably in a contract, with an escape hatch
like today's 7-day `withdrawStake`". But once match results live only in the
server ledger, the on-chain per-user balance is stale the moment a game ends.
A force-withdraw escape hatch then lets a loser exit at their pre-loss
balance unless the operator periodically **checkpoints** ledger balances
on-chain (plus a challenge window). Without checkpointing — real additional
design and gas cost — the vault's guarantee degrades to "the operator
decides", which is exactly Option 2's trust model wearing a contract. The
current escrow's per-match escape hatch is genuinely stronger than a naive
vault would be.

## 3. Option 2 — full CEX-style: deposit addresses, sweep, server ledger

Users keep their existing per-user address purely as a **deposit address**
(the "send to your address / QR" flow in `DepositModal` already works exactly
like this). A watcher credits the ledger on confirmed inbound transfers; a
sweeper consolidates funds to a treasury wallet; all game money movement is
DB-only; withdrawals are server-executed payouts with risk checks.

**Why the codebase is already 80 % of the way there**

- Per-user server-held keys → deposit addresses and ERC20 sweeps need no new
  key infrastructure (the server can sign the sweep from the user's key —
  no per-address gas dusting scheme needed for native ETH sweeps either,
  and for ERC20 sweeps the existing `ensureGasFor` dusting pattern is
  reusable as-is).
- The `stake.sweeper.ts` pattern (status-driven, idempotent,
  chain-state-first reconciliation, attempts cap) is exactly the shape the
  deposit watcher and withdrawal processor need.
- `assertRoomPlayable` gating, `stake:funding/funded/failed` events, and
  `completeMatch` funneling stay structurally intact — their implementations
  just flip from chain calls to ledger transactions, which makes them
  **synchronous**: `stake:funded` can be emitted inside the join request,
  and the funding overlay disappears from the happy path entirely.

**What it gives up**: any on-chain guarantee. The existing 7-day
`withdrawStake` hatch dies with per-match escrow. Fine on Sepolia play-money;
a real-money launch should acknowledge this is plain custody (which, per
§1, it already de facto is — the Profile screen's self-custody claim is
already false and is logged in `MOBILE.BAI.md`).

## 4. Shared core (identical for both options — and it's most of the work)

1. **Ledger schema + service**: `balances` (per user × asset),
   `ledger_entries` (append-only double-entry journal: deposit, stake-hold,
   stake-release, stake-capture, prize, fee, withdrawal, sweep), with
   idempotency keys. All mutations in Postgres transactions —
   `SELECT … FOR UPDATE` on the balance row, not the Redis cache locks.
2. **Stakes service rewrite**: join → place hold (fails instantly on
   insufficient balance, killing the TOCTOU problem); `completeMatch` →
   capture holds, credit winner minus fee, all in one DB tx. The
   `stake_escrows` entity shrinks to (or is replaced by) ledger entries.
3. **Deposit watcher**: poll the RPC for inbound native/ERC20 transfers to
   user addresses (or Alchemy webhooks later), credit after N confirmations,
   store tx hash as the idempotency key.
4. **Withdrawal pipeline**: `POST /wallets/withdraw` → debit-with-hold →
   queued, server-signed payout tx → confirm → finalize (reuse the sweeper
   retry/nonce discipline; this is where proper nonce management finally
   gets built, once, instead of per-match).
5. **Mobile changes**: balance source flips from client-side RPC multicall
   to the server ledger (`GET /wallets/balances` already exists, unused);
   `WithdrawModal` calls the API instead of signing locally; deposit screen
   gains a "credited after N confirmations" pending state; the
   `StakeFundingOverlay` wait path is deleted; Profile copy corrected.
   The Keychain key/mnemonic stays as the user's recovery artifact for the
   deposit address, but stops being a spending path (its local-transfer use
   would bypass the ledger and must be removed or scoped to pre-credit
   funds).
6. **Reconciliation job**: assert sum(ledger) == treasury on-chain holdings
   per asset; alert on drift. Non-negotiable once balances are DB rows.

## 5. Recommendation: **Option 2**, designed so the vault can be added later

Reasons, in order of weight:

1. **No trust is actually lost.** The server already holds and uses every
   player key; Option 1's extra on-chain guarantee is largely optics unless
   checkpointing is built, which is the hardest part of that design.
2. **Option 1 ⊃ Option 2's infrastructure anyway.** The ledger, watcher,
   sweep, and withdrawal pipeline are needed in both. Option 1 adds a
   contract, its tests/audit surface, ABI sync burden, and the
   checkpoint/escape-hatch design on top — for a product currently on
   Sepolia with mock USDC.
3. **It fixes every friction point at once**: instant staked match start,
   instant visible settlement, no per-match gas, no operator-nonce traffic
   jam (chain txs drop to deposits/withdrawals only), rematches free.
4. **Clean upgrade path.** Because game money movement is pure ledger in
   both options, "move the treasury into a vault contract with operator
   checkpoints" is a later, isolated chain-layer change that doesn't touch
   the game/stakes code. Ship Option 2, add the vault when a real-money
   launch makes the trust story worth its cost.

Keep `MatchEscrow` deployed and the current code path behind a config flag
during migration (existing in-flight escrows must drain through the old
sweeper), then retire it.

## 6. Effort estimate

Assumes one experienced dev, and includes tests. The ledger correctness work
is the long pole — it's money, so the testing bar is higher than a feature.

| Work item | Estimate |
| --- | --- |
| Ledger schema, service, hold/capture semantics, migrations | 3–4 days |
| Stakes service rewrite + gateway/event integration + old-path flag | 2–3 days |
| Deposit watcher + confirmations + idempotency | 2–3 days |
| Sweep-to-treasury job (Option 2 delta) | 1–2 days |
| Withdrawal pipeline incl. real nonce management | 3–4 days |
| Mobile: balance source, withdraw via API, deposit pending UX, overlay removal | 3–4 days |
| Reconciliation job + admin visibility | 1–2 days |
| Integration testing, failure-mode drills (crash mid-credit, double webhook, RPC lag) | 3 days |
| **Option 2 total** | **≈ 18–25 dev-days (3.5–5 weeks)** |
| Option 1 additions: vault contract + tests + deploy + ABI mirror + depositFor sweep variant + checkpoint design | +7–10 days |
| **Option 1 total** | **≈ 5–7 weeks** |

**Change size**: large. Server gains a new ledger module and a rewritten
stakes internals (public API/event shape mostly preserved); mobile wallet
screens change moderately; game logic, gateways, and `packages/core` game
rules are essentially untouched. With the old path kept behind a flag, it
ships incrementally: ledger + deposits first, then staked matches on ledger,
then withdrawals, then retire the escrow path.

## 7. Bugs found during the investigation (logged, not fixed)

Independent of the architecture choice, five server bugs and one mobile
inconsistency surfaced and are logged in `bugs-and-inconsistencies/`
(`SERVER.BAI.md` 2026-07-29: operator-lock contention burns funding
attempts; no nonce management for stuck txs; cached room reads in money
paths; `fundNativeAs` missing gas dust; funded-but-never-played rooms never
voided. `MOBILE.BAI.md` 2026-07-29: Profile screen's false self-custody
claim). The first two are worth fixing even before any migration — they can
void real matches today under mild concurrency.
