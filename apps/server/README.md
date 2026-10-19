# apps/server

The game server: a NestJS monolith that owns accounts, rooms, live match
state and the stake ledger. REST lives under `/api/v1`; realtime play runs on
socket.io gateways authenticated with the same JWT. Health probes
(`/health`, `/healthcheck`, `/status`) are unprefixed.

## Running it

From the repo root:

```bash
docker compose -f apps/server/docker-compose.yaml up -d   # Postgres :5433, Redis :6380
cp apps/server/.env.example apps/server/.env              # fill JWT_SECRET and W_ENCRYPT, set NODE_ENV=development
npm run build --workspace @gaming-platform/core
npm run server                                            # nest start --watch on :3000
```

Migrations run automatically at boot, under a Postgres advisory lock so that
several instances starting together do not race. `npm run server:migration:run`
applies them by hand; `npm run server:migration:generate -- src/db/migrations/<Name>`
generates one from entity changes.

Other scripts in this workspace: `build`, `start:prod`, `start:debug`,
`typecheck`, `test`, `test:watch`, `test:e2e`, `migration:revert`.

The image is built from the repo root with `docker build -f apps/server/Dockerfile .`.

## Environment

All names come from `.env.example`, which documents each one.

| Group | Variables |
| --- | --- |
| Required | `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `W_ENCRYPT` |
| Core | `PORT`, `REDIS_URL`, `WS_EMIT_LOGS`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN_DAYS`, `POSTGRES_SSL`, `NODE_ENV` |
| Login | `RESEND_API_KEY`, `EMAIL_FROM`, `SIWE_DOMAINS`, `DEMO_LOGIN_EMAIL`, `DEMO_LOGIN_CODE` |
| Operators and bots | `ADMIN_TOKEN`, `BOT_SECRET` |
| Chain and staking | `CHAIN_RPC_URL`, `CHAIN_ID`, `OPERATOR_PRIVATE_KEY`, `CHAIN_CONFIRMATIONS`, `STAKE_MAX`, `STAKE_POT_ADDRESS`, `STAKE_POT_DEPLOY_BLOCK`, `STAKE_FEE_BPS`, `STAKE_POT_POLL_MS`, `STAKE_POT_RECONCILE_MS`, `FAUCET_KEY`, `FAUCET_GRANT_KOMBAT`, `WALLET_GAS_DUST_ETH` |
| ENS subnames | `NAMESPACE_API_KEY`, `ENS_PARENT_NAME` |

`NODE_ENV` fails closed: any value other than `development` or `test`,
including unset, runs in production mode (rate limiting on, the test module
off).

Everything outside "Required" is optional and degrades cleanly: no
`REDIS_URL` means an in-memory store and adapter (single instance only), no
`RESEND_API_KEY` means login codes are logged instead of emailed, and no chain
configuration means staked rooms are unavailable while free play works.

## Modules

| Directory | Responsibility |
| --- | --- |
| `authentication` | Email one-time codes, SIWE (EIP-4361) nonce and verify, bot login, JWT access tokens with rotating refresh tokens |
| `users`, `rankings` | Profiles, stats, username lookup, leaderboard (bots excluded) |
| `wallets` | Custodial wallet creation (key encrypted with AES-256-GCM under `W_ENCRYPT`), balances, gas top-up |
| `games` | Rooms (public, private by code, multi-seat start-early, leave, forfeit), one match service and gateway per game, `GameDeadlineSweeper`, abandoned-room cleanup |
| `games/stakes` | Locking and settling stakes per room, and a sweeper that settles rooms whose match ended without settlement |
| `stake-pot` | The ledger: deposit watcher, withdrawals, withdrawal sweeper, reconciliation job, signup faucet grant |
| `cache` | `CacheService` over a Redis or memory store: keyed state, per-room locks, the deadline sorted set |
| `websockets` | Connection auth, per-user and per-channel broadcast, the Redis adapter |
| `ens` | Off-chain ENS subnames (`<username>.<ENS_PARENT_NAME>`) through the Namespace SDK |
| `admin`, `maintenance` | Token-guarded operator API (stats, bot seeding, maintenance mode, minimum app version) |
| `test` | Database reset endpoint, loaded only outside production |

## Design notes

- **Clients send intent, never outcomes.** Rules come from
  `@gaming-platform/core` and every incoming value is re-checked against live
  state (whose turn, remaining budget, reachable squares). For Salvo the
  server simulates the projectile and ships the path, because floating-point
  trajectories are not bit-identical between Hermes on a device and V8.
- **Per-room locks.** Every gameplay mutation is a read-modify-write inside
  `cacheService.withLock(...)`. On Redis that is `SET NX PX` with a random
  token, released by a compare-and-delete script.
- **One sweeper for all turn clocks.** Deadlines are `roomId:kind:seq`
  members of one sorted set, popped atomically by a Lua script. Each enforcer
  re-validates the sequence under the room lock, so a stale deadline cannot
  act on a turn that has already moved on. Three missed turns lose a 1v1 game
  or eliminate a player in Ludo and Chroma Clash.
- **Ledger, not escrow.** Matches settle in Postgres (`staked_balances`,
  `stake_ledger_entries`, `match_settlements`). The chain is touched only by
  deposits, which a watcher reads from `Staked` logs after
  `CHAIN_CONFIRMATIONS`, and withdrawals, sent by the operator key with a
  unique withdrawal id that the contract refuses to pay twice. The
  reconciliation job checks `holdings == balances + in-flight withdrawals`
  per token.
- **Freshness where it matters.** Room reads go through a 60 second cache,
  but anything deciding whether a match may start or who may act reads the
  database directly, so correctness never depends on Redis being present.

## Tests

```bash
npm test --workspace @gaming-platform/server
npm run test:e2e --workspace @gaming-platform/server
```

Unit specs sit next to the code. The e2e suite (`test/`) boots the full app
against a dedicated `<POSTGRES_DB>_e2e` database that it creates if missing,
with Redis and all chain jobs switched off, and plays matches through real
socket clients with a controllable clock and dice.
