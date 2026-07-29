# apps/server - conventions

NestJS monolith: REST under `/api/v1`, socket.io gateways authenticated by the
same JWT as HTTP, TypeORM/Postgres entities, a Redis-backed cache for live
match state, one `GameDeadlineSweeper` for every game's turn clocks, and the
staking/escrow chain service.

## Adding a new game

Every game follows the same five-part shape. Miss one and the game is either
unplayable or, worse, creatable but dead. Use `salvo/` as the most recent
worked example.

1. **Rules go in `packages/core`**, never here. The server and the mobile
   client import the *same* functions, so they can never disagree about what
   a move means - only about who is allowed to apply it. Anything that decides
   an outcome (damage, legality, terminal state) belongs in core; the match
   service only orchestrates it.

2. **Match service** (`<game>-match.service.ts`) owns the authoritative state
   in the cache. Every read-mutate-write runs inside
   `cacheService.withLock(CacheKeys.<game>Lock(roomId))`. Add the two cache
   keys and, if the game is turn-based, a `DeadlineKind` in
   `cache/stores/cache-store.ts`.

3. **Gateway** (`<game>.gateway.ts`) mirrors the others: `@UsePipes(new
   ValidationPipe({ whitelist: true }))`, prove the caller is a participant,
   broadcast public payloads to `gameChannel(roomId)`, push anything private
   to the caller only. On a terminal result call
   `stakesService.completeMatch(roomId, winnerUserId, reason)` - that records
   history and queues escrow settlement.

4. **Turn clock**: schedule with `deadlineMember(roomId, '<game>-turn', seq)`
   and add an enforcer to `GameDeadlineSweeper`. The `seq` guard is what stops
   a stale deadline enforcing a turn that already moved on.

5. **Register the game type** in `MULTIPLAYER_GAME_TYPES`
   (`core/games/game-room.types.ts`) **only once the gateway exists**.
   `CreateGameRoomDto` validates `gameType` with `@IsEnum(GameType)`, which
   accepts every enum member - so a value without a gateway behind it would
   otherwise let a caller create a real, joinable, potentially staked room
   that could never be played. `GamesService.createRoom` enforces the
   allowlist. Also add the player count in `game-type.util.ts`.

## Trust boundary

Clients send **intent**, never outcomes. Take the move they want and re-derive
the result here; never accept a computed result and "verify" it.

Re-clamp every incoming value against live server state even when the DTO
already bounds it - the DTO is only the outer envelope, and the guards that
matter (whose turn it is, what budget is left, what is reachable) depend on
state the client cannot see.

This is not optional for games with continuous physics. Trajectory integration
uses transcendental maths over thousands of accumulating steps, and those are
not bit-identical between Hermes on a device and V8 here, so there is no
tolerance that both catches cheating and survives engine drift. The server
simulates and ships the result; the client replays it.

Never broadcast information a player has not committed to yet - a dialled aim,
an unplayed hand. Send it with the action, not before it.

## Events that move the client between screens

Room lifecycle events (`ROOM_EVENTS.started`, `game:opponent-joined`,
`STAKE_EVENTS.funded`) cause the mobile app to dismiss an overlay and push a
match screen. Emit **one** such event per transition, and never two in the
same tick: the client has to serialize its native modal dismissal against the
navigation push, and a second event mid-sequence re-triggers it. This has
caused repeated "app renders but is touch-dead" bugs on iOS - see
`apps/mobile/claude/reports/OVERLAY_BLOCKED_ERROR.md`.
