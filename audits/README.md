# Security audit & code review — 2026-07-31

Full review of the staking gaming platform, split per service. Reports:

- **[server.md](server.md)** — the NestJS monolith: stake-pot ledger, withdrawal flow, wallet custody, game-outcome authority and settlement, auth/secrets, websocket auth, and horizontal-scaling behaviour.
- **[contracts.md](contracts.md)** — the `StakePot` / `KombatCoin` / `MockUSDC` Solidity contracts and deploy scripts.
- **[mobile.md](mobile.md)** — the React Native custodial client: key handling, JWT storage, permit signing, deposit/withdraw flows, transport.

## The two questions you asked

**Can the pot be drained?** On-chain and in the withdrawal path, no — every outflow is access-gated, withdrawals only pay the caller's own custodial wallet, and deposits/settlement are designed to be idempotent. **But there is one real, client-reachable drain in match settlement: [server C-1](server.md#critical).** `completeMatch` settles the (correctly, server-decided) winner without an atomic "settle exactly once" guarantee, so a sybil pair spamming `forfeit` can make the server apply the same payout several times concurrently and withdraw the surplus. Confirmed by direct trace; fix is a small atomic escrow-status transition. This is the first thing to fix.

**Monolith vs. microservices?** A single instance of the monolith is the right call for now — the architecture is coherent and the hard invariants live in Postgres and the chain. You don't need services. You do need Redis to be *mandatory* and the operator-tx handling hardened before you ever run a second instance ([server R-1, R-2, R-5](server.md#high)).

## Everything worth acting on, ranked

| # | Sev | Service | Finding |
|---|-----|---------|---------|
| 1 | **Critical** | server | C-1 — `completeMatch` double-settle drains the pot (sybil + forfeit-spam) |
| 2 | High | server | S-1 — test module + dev token route unauthenticated, gated only by `NODE_ENV` |
| 3 | High | server | S-2 — `channel:join` pub/sub unauthorized: any match is *watchable* (seat-joining and gameplay ARE authorized) |
| 4 | High | server | H-2 — settle-vs-release race: winner paid *and* refunded |
| 5 | High | server | R-2 — operator lock TTL 120s < receipt wait 180s: nonce collision even with Redis |
| 6 | High | mobile | H2 — cleartext HTTP not blocked; JWT + mnemonic ride an unenforced-TLS channel |
| 7 | High | mobile | H3 — JWT stored in plaintext AsyncStorage, not the Keychain |
| 8 | High | mobile | H1 — decide & document the custodial model (server generates the mnemonic) |
| 9 | Med | server | R-1 — operator lock only cross-instance with Redis (make Redis mandatory) |
| 10 | Med | contracts | M-1 — "rolling 24h" limit is a fixed window: 2× blast radius |
| 11 | Med | contracts | L-1/M-2 — `owner == operator` deploy gap; fee-on-transfer over-credit |
| 12 | Med | server | S-3 — no rate limiting anywhere |
| 13 | Med | mobile | M2 — pot/permit-spender address from server not pinned |
| — | Med/Low | server/mobile | R-3..R-7, M-3, S-4/5, mobile M1/M3/L1-5 — see per-service reports |

Per the repo's BAI convention the net-new server bugs (C-1, S-1, S-2, R-2, R-3, R-4, M-3) would normally be logged in `bugs-and-inconsistencies/SERVER.BAI.md`; they're captured here instead since this whole exercise was the audit. Say the word and I'll file them there and/or start on the C-1 fix.
