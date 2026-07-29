# Salvo - technical notes

Salvo is the platform's two-tank artillery duel. Both players sit on a
procedurally generated, destructible ridge and trade shots by dialling an
elevation and a muzzle power until one hull is gone. It runs in two modes off
one screen: a local duel against a bot (the Demo tab) and a
server-authoritative online match (a lobby room).

This document explains how it is put together and, more importantly, *why* the
pieces are split the way they are. The design source is the "Salvo" screens in
the Kombat Redesign document (`Salvo · your turn`, `Salvo · incoming fire`,
`Salvo · victory`).

---

## 1. Where the code lives

| Layer | Path | Responsibility |
| --- | --- | --- |
| Rules | `packages/core/src/games/salvo/` | Terrain, ballistics, damage, movement. Pure, no platform imports. |
| Protocol | `packages/core/src/games/salvo/salvo.protocol.ts` | Socket event names + payload types shared by both sides. |
| Server | `apps/server/src/games/salvo/` | The authoritative match: state, validation, simulation, broadcasts. |
| Client | `apps/mobile/src/games/salvo/` | Rendering, animation, input. Two engines behind one screen. |

The split follows the repo convention: anything that decides an outcome lives
in `core` and is imported *identically* by the server and the client, so the
two can never disagree about the rules - only about who is allowed to apply
them.

---

## 2. Terrain space

Everything is authored in a fixed coordinate space so no renderer ever has to
re-derive geometry:

- **560 units wide, 340 tall.** The height matches the design's battlefield
  viewBox; the width is far wider than one screen so the map is something you
  scroll across, with room either side of both tanks to drive into.
- **y is measured upward from the bottom.** Screen space is y-down, so the
  renderer flips once (`py = height - y * scale`) and nothing else thinks
  about it.
- `terrain.heights[x]` is the ground height at column `x`. That array *is* the
  battlefield - it is mutated by craters and is the only truth about the
  ground.

Terrain is generated from a seed with three sine octaves over a flat base,
clamped to `[42, 118]`. The octave wavelength is referenced to a fixed
`TERRAIN_PERIOD` (328) rather than the field width, so widening the map
produces *more ridges* instead of the same ridges stretched flat.

Tanks are **not** given levelled pads. A hull rests on whatever column it
occupies and tilts to the local slope (`slopeAt`, clamped to 17°). An earlier
version flattened a strip under each tank and it cut visible cliffs into the
ridge, which also gave shells somewhere to hide.

---

## 3. Ballistics

`fireShot(terrain, shooter, target, wind)` integrates one shell and returns
its sampled path, impact point, impact kind, and the damage to both hulls.

Semi-implicit Euler, `dt = 0.25`, up to 8000 steps, every 2nd step kept for
drawing (~60 points for a typical shot). Constants:

| Constant | Value | Note |
| --- | --- | --- |
| `GRAVITY` | 0.43 | Tuned with `POWER_SCALE` so the design's opening aim (38° at 68 power) very nearly crosses the ridge. |
| `POWER_SCALE` | 0.135 | Muzzle velocity per point of the 0-100 dial. |
| `WIND_SCALE` | 0.0055 | Horizontal acceleration per point of wind. |
| `MUZZLE_HEIGHT` | 15 | **Must exceed `TANK_HEIGHT`** - see below. |
| `DIRECT_DAMAGE` | 38 | Hull struck within `DIRECT_CORE` (6) of its centre. |
| `HULL_DAMAGE` | 26 | Hull struck off-centre. |
| `SPLASH_MAX_DAMAGE` | 16 | Near miss, tapering to 1 at `BLAST_RADIUS` (30). |

Two details that are easy to get wrong and were both real bugs during the
build:

**Muzzle clearance.** The shell spawns at `groundAt(x) + MUZZLE_HEIGHT`. If
that is inside the shooter's own hit box (`TANK_HEIGHT`), every shot
detonates on its own hull the instant it leaves the barrel. The three
constants `SALVO_TANK_SCALE`, `TANK_HEIGHT` and `MUZZLE_HEIGHT` are therefore
coupled: shrinking the sprite means shrinking the hit box means lowering the
muzzle, and the muzzle must stay above the hull.

**Arming.** A shell only counts as hitting its *own* tank once it has cleared
it at least once (`armed`). That way a steep lob that falls back on the
shooter still counts, while the launch itself never does.

**Damage tiers.** `fireShot` tracks *which* hull the shell struck, and
`blastDamage` grades the result: a strike within 6 units of the hull centre is
a direct hit, any other strike is a hull hit, and anything that merely lands
nearby is splash measured from the hull's *edge*. Before this, damage was
purely distance-based, so an impact within 7 units did full damage and a near
miss was worth exactly as much as a direct hit - aiming precisely bought you
nothing. Roughly 3 direct hits, 4 hull hits or 7 splash hits kill.

**Craters are circular.** `carveCrater` takes a true circular bite centred on
the impact: at each column the new surface is the bottom of that circle,
wherever the ground already sits lower. `CRATER_RADIUS` (14) is chosen so the
earth moved matches the old parabolic notch - same volume, better shape -
while leaving ~17% of the map scraped to the floor by the end of a match
rather than ~30%.

---

## 4. Movement

Each turn is **one drive plus one shot**. Firing ends the turn.

- `SALVO_MOVE_RANGE` (40 units) is the whole turn's allowance.
- `clampTankX(x, dx, side, otherX)` holds a tank inside `SALVO_EDGE_MARGIN` of
  the field edges and never lets the two close inside `SALVO_MIN_SEPARATION`
  (90 units). It returns the reachable column, so the caller can bill the
  distance actually travelled rather than the distance requested.
- One tap drives for `DRIVE_MS` (1.5s), rolling over the contour. Dials and
  FIRE lock while a hull is moving.

---

## 5. The client

### Two engines, one screen

`SalvoPlayScreen` is pure UI. It never resolves a rule. It is fed by whichever
engine the container picked:

```
SalvoGame
  ├─ no roomId → useLocalSalvo      (bot duel, client owns everything)
  └─ roomId    → useMultiplayerSalvo (server owns everything)
```

Both satisfy the same `SalvoEngine` contract (`salvo-engine.ts`), so the
screen, the battlefield renderer, the blast animations and the result screen
are shared verbatim.

### Camera

The world is rendered at `viewport.width / VISIBLE_UNITS` (190 units visible),
making it roughly three screens wide, inside a horizontal `ScrollView`.

The scale is **uniform** on both axes. An earlier version scaled x by the zoom
and y by the field height, which stretched trajectories horizontally and made
a 45° barrel throw an arc that did not look like 45°. Only the decorative
parallax ridges still stretch to fill, because nobody measures a backdrop.

Camera behaviour:

- On first content measure, frame my own tank. This must wait for
  `onContentSizeChange` - calling `scrollTo` before the scroll content is
  measured silently clamps to 0.
- On each of my turns, ease back to my tank.
- **During a shot, chase the shell only if the tank being fired at is off
  screen.** Decided once per shot, latched on `flight.id`.

### Aiming

Three ways in, all feeding the same clamped value:

1. The `-` / `+` steppers on the ANGLE card.
2. **Dragging the barrel.** A `PanResponder` patch (150pt) around the muzzle
   converts the touch vector into an elevation. It claims the gesture only
   when a barrel is grabbable, so every other drag still pans the map, and
   `onPanResponderTerminationRequest: () => false` stops the ScrollView
   stealing it mid-drag.
3. The turn clock running out (local mode only - see §6).

Whoever is lining up a shot shows tick marks marching out of the barrel
(`aimGuide`), length scaled by power. It reads the dial without giving the
landing point away.

### Animation

Blasts are driven by a **plain number ticked from JS** with
`requestAnimationFrame`, not by a Reanimated shared value.

This was a deliberate change after a bisect: assigning a static value to a
shared value paints the Skia nodes correctly, but `withTiming` into the same
nodes never animates them in this app. The shell flight already used a
JS-driven interval and was smooth, so the blasts follow it.

> Worth knowing: `battleship-markers.tsx` (`MineExplosion`, `BombBlast`,
> `TorpedoProjectile`, ship entry/sink) all drive Skia from `withTiming` the
> same way. Those were not tested during this work - if they look static, this
> is likely why.

Sequence when a hull dies:

1. Shell lands, 620ms impact blast.
2. 1.5s wreck blast over the destroyed tank.
3. **3.5s hold** on the burning wreck.
4. Result screen.

The engine separates *decided* from *revealed* for exactly this reason.
`winner` is set the moment HP hits zero and everything that could let a player
keep acting - turn, dials, FIRE, clock, bot aim - gates on that. Only `result`
is withheld for the hold. Without the split you could keep firing at a corpse
during the animation.

---

## 6. Multiplayer

### Why the server is the only simulator

Every other game on the platform is discrete - cards, dice, grid cells - so a
client and the server trivially agree on an outcome. Salvo is not. It
integrates `Math.sin`/`Math.cos` over thousands of accumulating steps, and
those are **not bit-identical across JS engines**. Hermes on a device is not
V8 on the server; a last-ulp difference compounds into a visibly different
impact point.

So there is no tolerance you could pick for "does the client's result match
the server's" that is both tight enough to catch cheating and loose enough to
survive engine drift.

The protocol is therefore **intent in, outcome out**:

| Client sends | Server returns |
| --- | --- |
| `salvo:move { toX }` | `salvo:moved { x, movesLeft }` |
| `salvo:fire { angle, power }` | `salvo:shot { path, impact, kind, damage, hp, stats, crater, … }` |

The client animates the server's own sampled path rather than one it computed
itself. The cost is one round-trip before the shell moves; for a turn-based
game that is not noticeable.

### What is validated

- **DTO envelope** - `class-validator` bounds `angle`, `power` and `toX` to
  the field and dial limits.
- **Re-clamped in the service** - `clampAngle` / `clampPower` / `clampTankX`
  run again against the server's own state, so the DTO is only the outer
  envelope.
- **Turn ownership and phase** - `assertTurn` (participant + in play + your
  turn) guards both `move` and `fire`.
- **Movement budget** - the server recomputes the reachable column from *its*
  positions and bills `movesLeft`. A client asking to teleport is clamped, not
  rejected.
- **Wind and terrain seed** - rolled server-side from `randomInt`. Never
  client-supplied.
- Every mutation runs inside `cacheService.withLock(salvoLock(roomId))`.

### Terrain over the wire

The heightmap ships whole in the `salvo:state` snapshot, because it is
destructible and a seed alone would not describe the *current* battlefield.
After that only the impact point travels: `carveCrater` is plain arithmetic
with no transcendentals, so both sides applying it to the same impact stay in
step. A reconnect re-sends the full snapshot.

### Information hiding

A seat's broadcast `angle`/`power` is **the aim it last fired**, not the aim
it is currently dialling. Live aim never leaves the client until the shell
does - otherwise the opponent could read your solution off the wire before you
committed to it. Locally, the screen shows my own barrel tracking my live
dial and the opponent's showing their last shot.

### Turn clock

The turn deadline is registered in the shared deadline ZSET as
`{roomId}|salvo-turn|{turnSeq}` and enforced by `GameDeadlineSweeper`. `seq`
guards against enforcing a turn that already moved on. Three timeouts
(`MAX_TIMEOUTS`) lose the match.

The client does **not** auto-fire on expiry in multiplayer - that would race
the sweeper. In the local demo it does, because there is no sweeper.

### Match end

`fire` / `forfeit` / the sweeper all funnel into
`stakesService.completeMatch(roomId, winnerUserId, reason)`, the same path the
other four games use, which records history and queues escrow settlement.

---

## 7. Enabling and disabling the online mode

`MULTIPLAYER_GAME_TYPES` in `core/games/game-room.types.ts` is the single
switch. `supportsMultiplayerRoom()` is checked in two places:

- `GamesService.createRoom` - rejects a room for a game with no gateway
  behind it, before any DB or stake work.
- `CreateGameRoomModal` - filters the catalog, so a game can never be offered
  in the UI that the server would refuse.

This matters because `CreateGameRoomDto` validates `gameType` with
`@IsEnum(GameType)`, which accepts *every* enum member. Adding a value to the
enum before its gateway exists would otherwise let a caller create a real,
joinable, potentially staked room that could never be played.

---

## 8. Bot

Local mode only. `chooseBotAim` grid-searches angle × power for the shot
landing nearest the target (skipping self-damaging ones), then jitters the
power by a spread.

The spread tightens each round - `max(8, 18 - round * 2)` - so the bot walks
its shots in the way an artillery crew ranges onto a target. Balance was
tuned over batches of 150 simulated matches: a competent player wins slightly
more than half, and matches run a median of 5-7 rounds. An earlier, tighter
curve (`max(4, 16 - round * 3)`) made the bot near-unbeatable past round 4.

---

## 9. Known gaps

- **Multiplayer has not been exercised end to end.** Everything typechecks and
  both apps build, but running a real match needs a server with Postgres and
  Redis plus two authenticated clients, which was not available during the
  build. The local demo *has* been verified on device throughout.
- **No rematch button.** The shared `GameResultScreen` only exposes a back
  action, so the result screen exits to the lobby like every other game.
- **`MatchChrome` is only used by Salvo.** The header and player bar were
  extracted from the Battleship screen, but the other four games still inline
  their own copies.
- **Unguarded `goBack()` elsewhere.** Salvo falls back to the tabs when
  nothing sits under the route; the other four game containers do not. Logged
  in `bugs-and-inconsistencies/MOBILE.BAI.md`.
