# Game Payments — Implementation Plan

Scope: stake ETH / KOMBAT / USDC / USDT (or play free) on 1v1 matches.
Stakes go into the MatchEscrow contract when the second player joins; the
winner is paid out (minus the 5% platform fee) when the match settles.
Match records persist who won, the stake and the token, for History.

Grounding: server custodies user wallets (encrypted private keys in
`wallets.key`, viem 2.x already a dependency), so the server can sign as any
player. Contracts from this repo are live on Sepolia (KombatCoin
`0xFE25…F943`, MatchEscrow `0x2889…874A`).

---

## 0 · Key decisions (the "you decide" parts)

**D1 — Stakes are pulled from the players, not fronted by the operator.**
The deployed escrow's `createStake` pulls the whole pot from the operator,
which would force a fund-shuffling hop (player → operator → escrow) per
match and turn the operator into a custodial hot pot. Since we hold player
keys, the cleaner model is per-player funding — which our *original* escrow
design already had. We redeploy (D2) with per-player funding restored.

**D2 — Contract v2 (redeploy, authorized).** Merge the session's original
per-player escrow with the current one's fee handling:

- `createMatch(matchId, p1, p2, token, amount)` — operator declares a match.
- Funding paths, per token type:
  - `openWithPermits(matchId, p1, p2, token, amount, sig1, sig2)` — create +
    pull both stakes in ONE operator tx using EIP-2612 permits (USDC, KOMBAT).
    Server signs permits with the players' keys; players need zero ETH.
  - `fundNative(matchId)` — player wallet sends its ETH stake itself (it has
    ETH by definition; gas comes from the same wallet).
  - `fund(matchId, player)` — pull via pre-existing allowance (USDT, which has
    no permit). Requires a one-time `approve` from the player wallet.
  - Match auto-activates when both stakes are in.
- `settleStake(matchId, winner)` — operator pays winner pot − fee; fee accrues
  to the on-contract `feePot` (kept from current version, owner-withdrawable
  via `withdrawFeePot`).
- `voidStake(matchId)` — **new**, operator-only: immediate refund of whoever
  funded, for cancelled/void matches (nobody deployed, funding failed halfway).
- `withdrawStake(matchId)` — public escape hatch after 7 days unsettled
  (kept; refunds players directly if the platform goes dark).
- Restore the **token allowlist** (fee-on-transfer safety) — allowlist ETH,
  KOMBAT, mock USDC, mock USDT.
- Reentrancy stays `ReentrancyGuardTransient`; fee stays 500 bps.

**D3 — Roles split: owner = cold, operator = hot.** Redeploy with owner =
platform key `0x0aB34352…Caa1` (admin + fee withdrawal, stays with you) and
operator = the already-funded Sepolia deployer key (`PRIVATE_KEY` in
`apps/evm-contracts/.env`) as the server's hot signer (`OPERATOR_PRIVATE_KEY`
in the server env). Owner can rotate the operator any time via `setOperator`.

**D4 — Test tokens.** Deploy `MockUSDC` (6 dp, with permit) and `MockUSDT`
(6 dp, no permit — promote the existing test mock to `src/`) on Sepolia with
a public `faucet(amount)` mint so devices can self-fund during testing.

**D5 — When funding happens: at join, both stakes at once.** Creating a
staked room locks nothing (cancelling stays free). When the second player
joins, the room enters a **Funding** state; the match (fleet setup) is gated
until the escrow confirms **Funded**. Permit tokens fund atomically in one
tx; ETH needs two player txs — if the second fails, `voidStake` refunds the
first. Funding failure ⇒ room voided, both players notified.

**D6 — Free games** skip everything on-chain: `stakeToken = null` ⇒ no
escrow record, no gating, no settlement.

**D7 — USDT ships in Phase 5** (last): its allowance path needs gas in the
player wallet for the one-time approve ⇒ operator "gas-dusts" the wallet
first. Mechanically simple but new moving parts; ETH/USDC/KOMBAT don't need it.

**D8 — `matchId` = `keccak256(utf8(roomId))`** — deterministic mapping from
the uuid; stored on the escrow row for audit.

---

## 1 · Contracts (`apps/evm-contracts`)

1. Rework `MatchEscrow.sol` per D2 (much of it is restoring code from this
   repo's git history: `createMatch` / `openWithPermits` / `fundNative` /
   `fund` / allowlist + keeping `feePot`, `withdrawFeePot`, `withdrawStake`).
2. Add `src/MockUSDC.sol` (ERC20Permit, 6 decimals, `faucet`) and
   `src/MockUSDT.sol` (no-return-value transfer style, 6 decimals, `faucet`).
3. Tests: original funding-path suites (permit / allowance / native /
   front-run permit consumption) + fee-pot suite + `voidStake` +
   partial-funding refunds. `forge test` green.
4. Deploy script: escrow (owner = `0x0aB3…`, operator = hot key) + both mocks;
   allowlist all four assets; print addresses; update README table.
5. Redeploy to Sepolia, record addresses in README + server `.env.example`.

Deliverable: new escrow + 2 mock tokens live on Sepolia, addresses documented.

## 2 · Shared types (`packages/core`)

- `StakeAsset` enum `{ ETH, KOMBAT, USDC, USDT }` + `STAKE_ASSET_DECIMALS`
  (18/18/6/6) + label map.
- `EscrowStatus` enum `{ Funding, Funded, SettlePending, Settled,
  VoidPending, Voided, Failed }`.
- `GameRoomSummary` += `stakeToken: StakeAsset | null`, `stakeAmount: string
  | null` (wei-string; clients format via decimals map).
- `MatchHistoryEntry` DTO: opponent username, gameType, result
  (`win|loss|void`), stake, token, prize delta, endReason, completedAt.
- Socket event names: `stake:funding`, `stake:funded`, `stake:failed`.

## 3 · Backend (`apps/server`)

**3a — Config + chain module.** New env: `CHAIN_RPC_URL`, `CHAIN_ID`,
`ESCROW_ADDRESS`, `KOMBAT_ADDRESS`, `USDC_ADDRESS`, `USDT_ADDRESS`,
`OPERATOR_PRIVATE_KEY`, `CHAIN_CONFIRMATIONS` (default 1). New `chain/`
module: viem public + wallet clients, escrow/ERC20 ABIs, an
`OperatorSigner` (nonce-safe: all operator txs serialized under a Redis lock
`chain:operator`), and a `PlayerSigner` that decrypts a wallet key via the
existing `WalletEncryptionService` — used for permit signatures (EIP-712,
off-chain, free) and ETH `fundNative` txs.

**3b — DB migrations.**
- `game_rooms` += `stake_token smallint NULL`, `stake_amount numeric(78,0)
  NULL`, `winner_user_id uuid NULL`, `end_reason smallint NULL`,
  `completed_at timestamptz NULL` (match results are not persisted today —
  History needs them regardless of stakes).
- New `stake_escrows`: `room_id` (unique), `match_id` (bytes32 hex), `status`
  smallint, `fund_tx_hashes jsonb`, `settle_tx`, `void_tx`, `payout`,
  `fee`, `error text`, timestamps. Audit trail + the worker's work queue.

**3c — Stake lifecycle orchestration.**
- *Create room*: DTO += optional `{ stakeToken, stakeAmount }` (both or
  neither; amount > 0; server-side balance check of creator).
- *Join room*: balance check of joiner; write `stake_escrows(Funding)`;
  respond immediately; run the funding job async.
- *Funding job* (idempotent, Redis-locked per room): USDC/KOMBAT → sign two
  permits, submit `openWithPermits`, await confirmations. ETH →
  `createMatch` (operator) then two `fundNative` player txs. Success ⇒
  `Funded` + broadcast `stake:funded` (match start becomes possible);
  failure/timeout ⇒ `voidStake` whatever landed, mark `Failed`, void the
  room, broadcast `stake:failed`.
- *Gate match start*: `BattleshipMatchService.getOrCreate` additionally
  requires `Funded` (or free) — mirrors the existing InProgress check.
- *Settlement*: battleship `endMatch` now also persists
  `winner/end_reason/completed_at` and marks the escrow `SettlePending`
  (winner) or `VoidPending` (voided match / nobody deployed). A
  `StakeSettlementSweeper` (same pattern as the deadline sweeper) drains
  pending escrows: `settleStake` / `voidStake`, N confirmations, retries
  with backoff, terminal `Failed` + error after max attempts (owner can
  always recover via `withdrawStake` after 7 days).

**3d — API surface.**
- `GET /games/history` — completed rooms for the user (paginated), shaped as
  `MatchHistoryEntry` (joins usernames; prize = payout − stake for wins).
- `GET /wallets/balances` — on-chain ETH + 3 token balances for the user's
  wallet (multicall; small Redis TTL cache). Backs the wallet screen and
  client-side stake validation.
- Room summaries include stake fields everywhere (lobby list, active room).

## 4 · Mobile (`apps/mobile`)

- **Create Room sheet**: wire the existing asset chips + fee stepper into the
  create API; ETH/KOMBAT/USDC enabled, USDT disabled until Phase 5; "Free
  game" = fee 0 ⇒ no stake fields; disable assets whose balance < fee.
- **Lobby**: room cards show real `stakeAmount + token` (drop
  `HARDCODED_STAKE`); FREE chip for free rooms.
- **Join flow**: confirmation sheet — "Join for 10 USDC · Winner takes 19"
  (pot − 5% fee) with balance check.
- **Funding state**: joining/created room shows "Securing stakes…" (reuse
  waiting-popup pattern) driven by `stake:funding/funded/failed`; on
  `funded` both transfer into the match as today; on `failed` show reason +
  room voided. Snapshot-resync on reconnect covers missed events (same
  pattern as b169d17).
- **Result screen**: winnings line (`+19 USDC` / `−10 USDC` / `Voided —
  refunded`).
- **History screen**: replace mocks with `GET /games/history`.
- **Wallet screen**: real balances via `GET /wallets/balances`; KOMBAT stays
  gold-highlighted; activity list can reuse history entries.

## 5 · Phases & verification

| Phase | Contents | Verify |
|---|---|---|
| P0 | Contract v2 + mocks, tests, Sepolia redeploy | `forge test`; `cast call` config |
| P1 | core types, migrations, chain module, env | server boots; migration up/down |
| P2 | funding-on-join + gate + settlement sweeper | integration vs Sepolia: 2 users, USDC stake, full loop |
| P3 | history + balances endpoints, summaries | curl + unit tests |
| P4 | mobile UX (sheet→history) | 2 simulators e2e: free, ETH, USDC/KOMBAT matches; kill-server-mid-fund |
| P5 | USDT (gas-dust + approve + `fund`) | e2e USDT match |

Failure drills worth testing deliberately: funding tx reverts (insufficient
balance pulled out from under a permit), server restart mid-funding (job
resumes via escrow row status), settlement retry after RPC outage.

## 6 · Needed from you

1. **Operator hot key**: OK to use the already-funded Sepolia deployer key
   (`PRIVATE_KEY` in `apps/evm-contracts/.env`) as the server's
   `OPERATOR_PRIVATE_KEY`? It pays all permit-path gas — keep it topped up
   with Sepolia ETH (faucet). Owner stays `0x0aB34352…Caa1`.
2. **Fee**: 500 bps (5%) confirmed? It's immutable per deployment.
3. **Stake limits**: min/max per asset (suggest min 1 USDC / 0.001 ETH / 1
   KOMBAT; max none for testnet)?
4. **USDT last** (Phase 5) — acceptable?
5. Sepolia-only for now (mobile + server pinned to 11155111) — correct?
