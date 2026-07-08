# Battleship multiplayer — execution plan

Implements `BATTLESHIP_SOCKET_CONNECTION.md`: two users who matched through the
lobby (create room → join room) play a real Battleship match against each other
with all existing features (fleet setup, turns, hits/misses/sinking, power-ups
with the charge-point economy, win/lose result screens). **Happy path only** —
no disconnect/reconnect/timeout-forfeit handling yet.

## Decisions (already made — do not re-litigate)

- **One websocket connection, always.** The app keeps the single socket owned
  by `websocket.store.ts` (connected at login, torn down at logout). Joining a
  game only means `joinChannel('game:' + roomId)` + subscribing to
  `battleship:*` events via the store's `on()`. No second connection, ever.
  Server-side note: a second NestJS gateway class in `GamesModule` shares the
  SAME underlying socket.io server (default namespace) as `WebsocketsGateway`
  — gateways are handler-organization only; the client still holds exactly
  one connection. Only `WebsocketsGateway` owns `handleConnection`/auth.
- **Server-authoritative, in-memory.** The server owns multiplayer match
  state in a `Map<roomId, …>` (same throwaway pattern as the `game:message`
  relay). No DB persistence of moves. Fleet positions never leave the owning
  player except for sunk-ship reveals.
- **Placement-based state, not 10x10 matrices.** The mobile app already has a
  proven model (`Placement`/`Shot` + pure helpers) — the core package adopts
  it. The server sketches in `apps/server/src/games/battleships/`
  (`battleship.game.ts`, `battleship.handler.ts`) and the unused sketch
  `packages/core/src/games/game.types.ts` are WIP scaffolds — **replace
  them** with the design below (keep the `battleships/` folder and the
  in-memory-cache idea; the matrix/`FieldStatus` approach goes away).
- **One game screen, `demo` flag.** `BattleshipPlayScreen` becomes pure UI
  (props in, callbacks out — it already is mostly presentation). A parent
  container (`BattleshipGame`) owns the mode:
  - `demo=true` (Demo Games tab, `BattleshipSetup` route): no websockets. A
    local bot plays: after your shot resolves, the bot fires at a random
    cell of YOUR board after a 3–4s delay, then the turn returns to you.
  - `demo=false` (`Battleship` route with `{roomId}`): everything flows
    through the socket protocol; the board only updates on server echoes.
- **Turn order (multiplayer)**: room creator fires first. Turn timer stays
  display-only in multiplayer (no forfeit). In demo, the existing
  timer-expiry → defeat behavior is kept (the demo engine decides that, not
  the UI screen).
- **Win condition**: all 4 of a player's ships sunk → other player wins (both
  modes; in demo you can now lose by fleet destruction too, since the bot
  fires back).

---

## Phase 0 — shared logic moves to `packages/core`

New folder `packages/core/src/games/battleship/`, exported from the package
index:

**`battleship.types.ts`** — moved from
`apps/mobile/src/games/battleship/setup/ship-placement.types.ts`:
`Orientation` (`'h' | 'v'`), `Cell`, `Placement`, `ShotResult`, `Shot`.
Add: `ShipSpec = { id: string; label: string; size: number }` (NO color —
color is presentation and stays mobile-side), `FleetPlacements =
Record<string, Placement>`, `PowerupKind = 'torpedo' | 'bomb'`.

**`battleship.rules.ts`** — pure logic, moved from the mobile files:

- From `setup/ship-placement.constants.ts`: `GRID = 10`, `FLEET: ShipSpec[]`
  (battleship 5, destroyer 4, frigate 3, scout 2), `SHIP_BY_ID`.
- From `setup/ship-placement.utils.ts`: `cellsFor`, `buildOccupied`,
  `canPlace`, `randomPlacement`, `formatCountdown`.
- From `game/opponent-fleet.ts`: `shipAt(row, col, fleet)`, `resolveShot`,
  `sunkShipIds` (they already take the fleet as an argument; the hardcoded
  `OPPONENT_FLEET` constant stays mobile-side for the demo).
- From `game/powerups.ts`: `POINTS_PER_HIT`, `POWERUP_COST`,
  `CHARGE_BAR_MAX`, `torpedoCells`, `bombCells`.
- New: `isValidFleet(placements: FleetPlacements): boolean` — every ship in
  `FLEET` present exactly once, in-bounds, non-overlapping.
- New: `randomFleet(): FleetPlacements` (extracted from the setup screen's
  auto-place loop — the demo bot and the E2E script both need it).

**`battleship.protocol.ts`** — socket event names + payload types shared by
server and mobile (single source of truth so the sides can't drift):

```ts
// client -> server
'battleship:ready'  { roomId: string; placements: FleetPlacements }
'battleship:fire'   { roomId: string; kind: 'single' | 'torpedo' | 'bomb';
                      row: number; col: number }
// server -> channel game:{roomId}
'battleship:opponent-ready' { userId: string }
'battleship:start'  { firstTurnUserId: string }
'battleship:shot'   { byUserId: string; kind: PowerupKind | 'single';
                      cells: Shot[];                    // resolved results
                      sunkShips: { id: string; size: number;
                                   placement: Placement }[];  // newly sunk
                      points: Record<string, number>;   // both players
                      nextTurnUserId: string;
                      winnerUserId: string | null }
// server -> caller only (validation failures; happy-path minimal)
'battleship:error'  { message: string }
```

Also a `BattleshipRoomState` type for the REST resume endpoint (personalized
per requester): `{ roomId; phase: 'setup' | 'play' | 'over';
myFleet: FleetPlacements | null; opponentReady: boolean;
myShots: Shot[]; opponentShots: Shot[];
revealedOpponentShips: { id; size; placement }[];  // sunk only
points: Record<string, number>; turnUserId: string | null;
winnerUserId: string | null; opponentUserId: string }`.

**Mobile cleanup in the same phase:** callers import the moved pieces from
`@gaming-platform/core` directly (delete the mobile shells where trivial).
What stays mobile-only: ship colors (new small `SHIP_COLORS: Record<string,
string>` map — core `ShipSpec` has no color; existing `ShipDef` consumers are
fed by `FLEET` + color map), UI constants (`LABEL_GUTTER`, `COLUMN_LABELS`,
`ROW_LABELS`, `SETUP_DURATION_SECONDS`), and the demo `OPPONENT_FLEET`.
Typecheck mobile after the move — this phase alone must not change behavior.

## Phase 1 — server

**`apps/server/src/games/battleships/battleship-match.service.ts`** (replaces
the two sketch files) — injectable, in-memory:

```ts
type MatchState = {
  roomId: string;
  players: [creatorId: string, opponentId: string];
  fleets: Record<string, FleetPlacements | null>;
  shots: Record<string, Shot[]>;      // shots FIRED BY that user
  points: Record<string, number>;
  phase: 'setup' | 'play' | 'over';
  turnUserId: string | null;
  winnerUserId: string | null;
};
```

Methods (all throw mapped errors on violations — wrong room membership, wrong
phase, not your turn, invalid fleet, unaffordable power-up):

- `getOrCreate(room: GameRoom)` — room must be `InProgress` with an opponent.
- `setFleet(roomId, userId, placements)` → validates with `isValidFleet`,
  stores; returns `{ bothReady }`. When both ready → phase `play`,
  `turnUserId = creatorId`.
- `fire(roomId, userId, kind, row, col)` → turn check; resolve cells with the
  core helpers against the OPPONENT's fleet (single = 1 cell, torpedo =
  `torpedoCells(row, opponentFleet)`, bomb = `bombCells(row, col, …)`);
  filter cells already shot by this user (like the mobile `applyShots`; if
  all filtered → error); award `POINTS_PER_HIT` per fresh hit; validate
  affordability BEFORE resolving and deduct `POWERUP_COST` for power-ups;
  compute newly-sunk ships via `sunkShipIds` diff; alternate `turnUserId`;
  if all opponent ships sunk → phase `over`, `winnerUserId = userId`.
  Returns everything the `battleship:shot` payload needs.
- `stateFor(roomId, userId): BattleshipRoomState` — personalized (own fleet,
  both shot lists, opponent fleet only as revealed sunk ships).
- `remove(roomId)`.

**`apps/server/src/games/battleships/battleship.gateway.ts`** — a second
`@WebSocketGateway()` class registered in `GamesModule`. It shares the same
socket.io server and client connections (see Decisions); it must NOT
implement `handleConnection` — it only registers `@SubscribeMessage`
handlers and reads `client.data.userId` that `WebsocketsGateway` set during
auth. If the userId lookup requires shared code, extract a tiny helper in
`websockets/` rather than duplicating JWT logic.

- `@SubscribeMessage('battleship:ready')` / `('battleship:fire')` with
  class-validator DTOs (`roomId` `@IsUUID()`, `row`/`col` `@IsInt() @Min(0)
  @Max(9)`, `kind` `@IsIn(['single','torpedo','bomb'])`). Handlers: load the
  room, assert the caller is creator/opponent, delegate to
  `BattleshipMatchService`, broadcast via
  `WebsocketsService.sendToChannel(gameChannel(roomId), …)` per the protocol.
  On `bothReady` → `battleship:start`; on first ready →
  `battleship:opponent-ready`. Errors → `client.emit('battleship:error', …)`
  to the caller only.
- On a winning shot: mark the room `Completed` (add
  `DbService.completeGameRoom(id)` mirroring `joinGameRoom`'s `.update()`
  pattern) and `BattleshipMatchService.remove(roomId)` AFTER broadcasting.

**REST**: implement the existing stub `GET games/rooms/:id/state` in
`games.controller.ts` (keep the author's shape intent): 404 if room missing,
403 unless caller is a participant, lazily `getOrCreate`, return
`stateFor(roomId, callerId)`. This is the mount/resume source of truth.

`GamesModule` providers: add `BattleshipMatchService`, `BattleshipGateway`.
No new module imports (`WebsocketsModule` is already imported).

## Phase 2 — mobile

**`ApiClient`**: add `getBattleshipRoomState(roomId): Promise<BattleshipRoomState>`
→ `GET /games/rooms/${roomId}/state`.

### 2a. `BattleshipPlayScreen` becomes pure UI

Strip ALL game logic from `game/BattleshipPlayScreen.tsx` (no
`OPPONENT_FLEET`, no `resolveShot`, no points mutation, no win detection).
It keeps only view-local interaction state (attack/fleet toggle, selected
cell, armed power-up, power-up target preview) and renders from props:

```ts
type BattleshipPlayScreenProps = {
  myFleet: PlacedShip[];              // fleet view
  myShots: Shot[];                    // attack view markers
  opponentShots: Shot[];              // fleet view markers (incoming)
  revealedEnemyShips: PlacedShip[];   // sunk reveals on attack view
  points: number;                     // my charge points
  myTurn: boolean;                    // gates FIRE + hint text
  action: GridAction | null;          // animation batch for MY shots
  opponent: { initial: string; name: string };
  sunkByMe: number; sunkByOpponent: number;   // header counts
  timerResetSignal: number;
  result: 'win' | 'lose' | null;      // when set, render GameResultScreen
  onFire: (kind: 'single' | PowerupKind, row: number, col: number) => void;
  onTimerExpire?: () => void;         // demo engine treats as defeat
  onExit: () => void;                 // header back
  onQuit: () => void;                 // result-screen Back
};
```

FIRE/LAUNCH calls `onFire(...)` and clears the local selection — it does NOT
apply shots. When `myTurn` is false, FIRE is disabled and the grid hint shows
an opponent's-turn treatment. Affordability gating for arming stays in the
screen (it has `points`). Stats for the result screen are derived from
`myShots`/`revealedEnemyShips` props. Keep the memoization discipline
(`useCallback` for grid callbacks, `useMemo` for derived arrays,
`TurnTimer` isolation).

### 2b. `BattleshipGame` is the container for BOTH modes

`BattleshipGame.tsx` gains props: `{ demo: boolean; roomId?: string }`.
Route wiring in `RootNavigator`: `BattleshipSetup` route renders
`<BattleshipGame demo />` (unchanged demo entry); the `Battleship` route
(params `{roomId}`) renders `<BattleshipGame demo={false} roomId={...} />`.
**Delete the placeholder chat `BattleshipScreen.tsx`** (the server-side
`game:message` relay may stay). Both modes share the flow: setup phase
renders the existing `BattleshipSetupScreen` unchanged → play phase renders
the pure-UI play screen fed by one of two engines:

**Demo engine — `game/useDemoBattleship.ts`** (hook):
- State: my placements (from setup), bot fleet = `OPPONENT_FLEET`, my/bot
  shots, my points, turn.
- `onFire` resolves locally with the core rules (identical math to today,
  including power-up costs/points), sets `action` for animations, then flips
  the turn to the bot.
- Bot turn: one `setTimeout` of 3000–4000ms (random), then the bot fires at a
  random cell of MY board it hasn't hit before (`randomly pick from unshot
  cells`), resolves against my placements, appends to `opponentShots`, and
  returns the turn to me. Bot uses single shots only (no power-ups). Clear
  the timeout on unmount.
- Win/lose: all bot ships sunk → `result='win'`; all MY ships sunk →
  `result='lose'`; `onTimerExpire` → `result='lose'` (preserves today's demo
  behavior).

**Multiplayer engine — `game/useMultiplayerBattleship.ts`** (hook):
- Uses ONLY the existing single socket via `useWebsocketStore`
  (`joinChannel('game:' + roomId)` on mount, `leaveChannel` on unmount,
  `on('battleship:*')` subscriptions) plus
  `apiClient.getBattleshipRoomState(roomId)` on mount for resume.
- Setup phase: `onReady(placements)` → `emit('battleship:ready', …)`; show a
  lightweight "Waiting for opponent…" overlay until `battleship:start` (or
  the fetched state already has both ready).
- Play phase: `onFire` → `emit('battleship:fire', …)`; the board updates only
  when `battleship:shot` echoes back (my shots → `action` batch for
  animations; opponent's shots → `opponentShots`). Track `turnUserId` vs my
  userId (`useCurrentUserStore`), points from payloads, sunk reveals,
  `winnerUserId` → `result`. `onTimerExpire` is a no-op (display-only).
- Opponent display name: from the room summary if available, else a userId
  prefix.

### 2c. Refactor fallout

Update every mobile import that pointed at moved constants/utils/types
(setup screen, grid, markers, PowerupBar, demo constants). `ShipDef`-with-
color consumers get color from the new `SHIP_COLORS` map. The navigation
param types (`Battleship: { roomId: string }`, `BattleshipSetup: undefined`)
stay as they are.

## Phase 3 — verification (in this order)

1. `npx tsc --noEmit` in `packages/core`, `apps/server`, `apps/mobile`
   (build core first if the workspace resolves `dist`).
2. **Server E2E, fully scripted** (the load-bearing verification — the whole
   protocol is testable without UI): a node script in the scratchpad using
   `socket.io-client` + REST that plays a complete match:
   - Two test users/JWTs (mint tokens with the server's JWT secret from
     `apps/server/.env`, the same trick as prior socket verifications).
   - A creates a room, B joins; both sockets `channel:join` the game channel;
     assert A receives `game:opponent-joined`.
   - Both `battleship:ready` (valid fleets via `randomFleet`); assert
     `battleship:opponent-ready`, then `battleship:start` with A first.
   - Scripted turns asserting: per-shot results, points accrual, turn
     alternation, sunk reveal (correct placement), torpedo + bomb resolution
     and cost deduction, affordability rejection, out-of-turn fire → error,
     duplicate cell → error, invalid fleet → error, `GET :id/state` for both
     users mid-game (assert personalization: B's state must NOT contain A's
     unsunk fleet).
   - Finish the match; assert `winnerUserId`, room `Completed`, and the state
     endpoint reports phase `over`.
3. Mobile: typecheck + simulator static verification of each visual state via
   the established temp-seed + `initialRouteName` technique: demo setup →
   play, my-turn vs opponent-turn treatments, waiting-for-opponent overlay,
   mid-game boards (both views), result screens. The demo bot's 3–4s
   return-fire CAN be observed on the simulator without tap automation:
   temp-seed the demo into play phase, wait, screenshot twice, confirm a new
   bot shot appeared. Then REVERT all temp overrides (confirm `git status`).
4. No new LogBox warnings (scratchpad `read_warnings2.mjs` Hermes script).
5. State plainly in the summary: interactive two-simulator play is left for
   the user to hand-test; the protocol itself is machine-verified by (2).

## Constraints

- Follow repo conventions: DTOs with class-validator; DB access only through
  `DbService`; `/api/v1` prefix comes from `ApiClient`; icons via `Icon.tsx`;
  colors from `theme/colors.ts` tokens; Skia `PathBuilder` only (no
  deprecated `SkPath` mutators — LogBox warns).
- Exactly ONE websocket connection app-wide (the existing store); games
  subscribe/unsubscribe to channels and events, nothing else.
- Don't regress: the demo flow (Demo Games → setup → play, now with the bot
  firing back), setup-screen drag/tap placement, the perf work (memoized
  grid, isolated `TurnTimer`, hover bail-out), the lobby create/join/
  waiting-popup flow.
- Happy path only: no disconnect/rematch/abandonment handling; a server
  restart loses in-memory matches (the state endpoint recreates an empty
  match — acceptable for now).
- Commit nothing unless asked.
