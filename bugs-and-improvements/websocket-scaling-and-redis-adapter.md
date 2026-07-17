# WebSocket scaling: game-server split, Redis adapter, Redis maintenance

Investigation notes (2026-07-17). Question: how big an effort is separating
websocket connections into a "game server" service, and what does scaling
sockets with `@socket.io/redis-adapter` look like operationally?

## Current architecture

Everything runs in one NestJS process (`apps/server`); socket.io is attached
to the same HTTP server as the REST API.

- `src/websockets/websockets.gateway.ts` - connection handling, JWT auth on
  the handshake, per-user rooms, channel join/leave, chat relay.
- `src/games/battleships/battleship.gateway.ts` - enter/ready/fire/forfeit
  plus presence. Holds no state; matches live in the cache via
  `BattleshipMatchService`.
- `src/websockets/websockets.service.ts` - thin wrapper around the socket.io
  `Server`. Single seam: every emit goes through `sendToUser`/`sendToChannel`.
- `src/games/battleships/battleship-deadline.sweeper.ts` - polls a
  Redis-backed deadline schedule; already written to be multi-instance safe
  (atomic pops, re-validation under the room lock).
- Emit call sites outside the gateways: `games.service.ts` (opponent-joined,
  REST forfeit), `stakes.service.ts` (funding lifecycle notifications).

The mobile client (`apps/mobile/src/store/websocket.store.ts`) opens one
socket to `env.apiBaseUrl` with `transports: ['websocket']` and replays every
`channel:join` on reconnect.

## Effort estimate for a service split

Roughly 2-4 days for a working split, 1-2 weeks polished with infra and
testing. The two real costs:

1. **Cross-service emits.** After a split the REST API can no longer reach
   sockets in-process. Fix: `@socket.io/redis-adapter` on the game server,
   `@socket.io/redis-emitter` on the API. `WebsocketsService` keeps its
   signatures; only its internals change.
2. **Stake settlement ownership.** The battleship gateway and deadline
   sweeper call `StakesService`, which reaches `ChainService` (platform
   signer). The signer should not live in two services. The out already
   exists: `completeMatch` queues settlement by writing DB statuses and
   `stake.sweeper.ts` drains that table independently, so the game server can
   carry a slimmed status-writing portion while the chain-touching sweeper
   stays with the API.

Breakdown:

| Work | Estimate |
| --- | --- |
| New `apps/game-server` Nest app; move gateways, match service, deadline sweeper | ~1 day |
| Redis adapter/emitter wiring; make Redis required | ~0.5 day |
| Split `StakesService` (status writes vs chain sweeper) | ~1 day |
| Mobile env/config change | ~1 hour |
| Deploy infra: second service, health check, CORS, LB | ~1-2 days |
| Testing (free rooms, staked rooms, timeouts, reconnects) | ~1-2 days |

## Alternative: scale the monolith (chosen direction)

If the motivation is scaling websockets rather than organizational
separation, no split is needed: add `@socket.io/redis-adapter` to the
existing monolith (~20 lines of NestJS `IoAdapter` glue in `main.ts`) and run
N instances. Decision: we'll eventually use the adapter.

### What the adapter does

socket.io tracks sockets and room membership in process memory, so an emit
from instance 1 never reaches a socket connected to instance 2. The adapter
replaces the in-memory broadcast component with one backed by Redis pub/sub:
every instance subscribes to a shared channel, every broadcast is also
published there, and each instance delivers to its local members of the
target room. Broadcasts behave as if all sockets lived on one server.

`@socket.io/redis-emitter` is the companion for processes that hold no
sockets but want to send events (relevant only if we later do the split).

### Scaling behavior

- **Up**: new instance subscribes to Redis and receives new connections.
  Existing connections do not rebalance - scale ahead of load, not in
  response to it.
- **Down / redeploy**: dropped sockets auto-reconnect to surviving
  instances; the client store replays `channel:join`; match state survives in
  the Redis cache; deadlines still fire because the sweeper pops from the
  shared schedule.
- Sticky sessions are NOT needed: the client already forces
  `transports: ['websocket']`, and stickiness only matters for the HTTP
  long-polling fallback.

### Pre-flight items before multi-instance

1. **In-memory cache fallback becomes a footgun.** `cache.module.ts` falls
   back to a per-process memory store when `REDIS_URL` is unset or
   unreachable. In multi-instance mode that means two instances can disagree
   about the same match's board. Multi-instance deployments must hard-fail
   without Redis instead of falling back.
2. **Battleship re-entry after reconnect.** The store replays
   `channel:join`, but the battleship `enter` event (presence + setup
   countdown push) is emitted by the game screen. Verify the screen re-emits
   `enter` when connection status flips back to `connected`; otherwise a
   reconnecting player shows offline until their next action (UX gap only -
   presence self-corrects on the next enter).

## Redis maintenance with the adapter

Once the adapter is in, Redis is load-bearing for far more than
cross-instance broadcasts. In this codebase Redis (when enabled) also holds:

- match state (boards, phase, turn) via the cache store
- the deadline schedule (setup/turn timeouts)
- funding locks and chat logs

So during a hard Redis outage it is not just "pause joining games":

- active matches stall (every fire/ready reads and writes the cache)
- deadlines stop being enforced (sweeper pops nothing)
- cross-instance events are lost for the duration (pub/sub has no replay;
  clients stay connected but miss whatever was published)
- same-instance delivery still works, but with multiple instances that is
  cold comfort

### Recommended maintenance approach

1. **Prefer failover over downtime.** Run managed Redis (or
   Sentinel/replica) and do maintenance via replica promotion - the
   observable window is seconds. `ioredis` auto-reconnects and the
   redis-adapter tolerates a reconnect; only events published inside the
   window are lost.
2. **If a real downtime window is unavoidable**, a maintenance mode is the
   right shape, and it should do more than block joins:
   - block room creation AND joining (REST level flag)
   - ideally wait for active matches to drain (or accept freezing them:
     match state has a TTL and turn deadlines will fire late or expire)
   - banner/notice to clients
3. **Client resync on reconnect** covers the lost-pub/sub-events gap: on
   reconnect the game screen should re-fetch the REST match snapshot rather
   than trusting the event stream to be gapless. The setup-state push in
   `battleship.gateway.ts#handleEnter` exists for exactly this kind of race
   already.

### Open questions

- Which managed Redis (and does the host support failover-based patching)?
- Do we enforce `REDIS_URL` per-environment via config validation at boot?
- Where should a maintenance-mode flag live (env var vs DB vs cache key)?
