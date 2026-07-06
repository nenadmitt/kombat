# Battleship — performance improvements + brand color change

Task list for the Battleship game code. Tasks 1–6 are perf refactors with
**no visual or behavioral changes**. Task 7 is a deliberate design change
(purple/blue → purple/green) and is the only task allowed to alter visuals.

Game code lives in `apps/mobile/src/games/battleship/`:

- `BattleshipGrid.tsx` — shared 10x10 Skia board (setup placement + gameplay)
- `battleship-markers.tsx` — animated hit/miss/sunk markers, torpedo, bomb blast
- `setup/BattleshipSetupScreen.tsx` — fleet placement screen
- `game/BattleshipPlayScreen.tsx` — battle screen (timer, powerups, FIRE)
- `game/PowerupBar.tsx`, `game/powerups.ts`, `game/opponent-fleet.ts`
- `ShipHull.tsx`, `ShipGraphic.tsx`, `setup/ship-placement.*.ts`

Do the tasks in order — 1 and 2 are the ones that matter; 5 and 6 are optional
and should be skipped unless profiling justifies them.

---

## 1. Stop re-rendering on every touch-move pixel (CPU — biggest win)

**Problem:** `BattleshipGrid.updateHover()` calls `setHover(...)` with a fresh
object on every move event (~60/s during a drag), re-rendering the grid — and
its ~300 Skia child elements — even when the finger is still inside the same
cell. The setup screen's placement preview has the same issue via the same code
path, and `BattleshipSetupScreen`'s own hover/preview logic should be checked
for the same pattern.

**Fix:** in `updateHover`, compare the computed `row`, `col` (and `valid`)
against the current hover state and return early when nothing changed. Use a
functional set or a ref mirror to do the comparison without adding the state to
the PanResponder's closure (the file already uses the ref-mirror pattern for
props — follow it).

**Acceptance:** dragging within one cell fires no re-renders (verify by
temporarily logging renders, then remove the log); preview still updates
instantly when crossing into a neighboring cell.

## 2. Isolate the 1-second countdown re-render (battery)

**Problem:** both screens tick `setSecondsLeft` every second at the screen
root, re-rendering the entire tree — including full Canvas reconciliation of
the 100-cell board — to update one `<Text>`. Additionally, the
`useEffect(..., [secondsLeft])` pattern destroys and recreates the interval
every single tick.

**Fix:**
1. Extract a small `TurnTimer` component (e.g. `game/TurnTimer.tsx`) that owns
   the countdown state internally and renders only the timer text. It needs:
   a `seconds` initial value, a `resetSignal` prop (bump a number to restart
   the countdown — the play screen resets it on every shot via `applyShots`),
   and it must stop at `0:00`. Reuse `formatCountdown` from
   `setup/ship-placement.utils.ts`. Use ONE interval created on mount /
   reset (functional updates, stop-condition inside the callback) instead of
   recreating it per tick.
2. Use it in both `BattleshipPlayScreen` (inside the turn pill, styled
   identically) and `BattleshipSetupScreen` (header timer).
3. Wrap `BattleshipGrid` in `React.memo`, and wrap the callbacks passed to it
   (`onCommit`, `isValidPlacement`) in `useCallback` in both screens so the
   memo actually holds. The grid already mirrors callback props into refs, so
   stale closures are not a concern — but make sure the `useCallback` deps are
   still correct so the refs receive fresh functions.

**Acceptance:** with the app idle on the battle screen, the board no longer
re-renders once per second (again: temporary render log, then remove).
Countdown still ticks, still resets after each shot/powerup, still stops at 0.

## 3. Memoize per-render allocations (CPU, minor)

In `BattleshipGrid.tsx`:
- `gridCells` (100 objects) and the `occupied` Set are rebuilt every render →
  `useMemo` keyed on `placedShips` and `active`.

In `game/BattleshipPlayScreen.tsx`:
- `revealedEnemy` and `myFleet` arrays are rebuilt every render → `useMemo`
  (`sunk` and `shotAt` already are; follow that style).

**Acceptance:** typecheck clean, no behavior change.

## 4. Single interval + misc cleanups (tiny, do while passing by)

- `game/BattleshipPlayScreen.tsx` and `setup/BattleshipSetupScreen.tsx`: the
  old interval-per-tick effect disappears as part of task 2 — confirm nothing
  else recreates timers per tick.
- `BattleshipGrid.tsx`: the `prevSunkRef` comparison string (`sunkIds`) is
  recomputed every render; fold it into the task-3 memoization if convenient.

## 5. OPTIONAL — static grid as one picture (skip unless profiling demands)

The 100 empty cells (fill + stroke + gradient each) never change shape. They
could be recorded once into an `SkPicture` (or merged into two `Skia.Path`
objects — one fill, one stroke) and drawn as a single node, collapsing ~300
scene-graph elements to a handful. Only worth doing if, after tasks 1–3,
profiling still shows reconciliation cost in the grid. Note the active-state
border color change (`ACTIVE_CELL_BORDER` on empty cells while a ship is
armed/selected) means two cached variants or a separate stroke layer.

## 6. OPTIONAL — RAM: reduce Canvas/surface count (skip by default)

Every `Canvas` (including each `GradientView` and each small `ShipGraphic`) is
a separate Skia surface/GPU texture. The play screen holds ~14 of them
(board, glow, toggle segments, progress/charge fills, FIRE button, up to 8 tray
ship silhouettes). This is acceptable today. If memory pressure ever shows up,
the cheapest wins are the small two-color gradient fills (buttons/bars) — a
pre-rendered stretched image or a shared canvas per region. Do NOT restructure
this now; this section exists so the tradeoff is documented.

---

## 7. Design change — brand gradient goes purple/green

The app's brand gradient is currently purple→blue. Switch it to purple→green,
using the same green as the battleship icon
(`apps/mobile/assets/games/battleship-icon.png`) — that icon is itself a
purple→green gradient and is the color reference. Sampled from the asset:

- Primary green (dominant emerald): `#00a070`
- Bright green accent (radar-blip/dot highlight): `#0ac994`

**How:**
- In `src/theme/colors.ts`, change `brandEnd` from `#3b82f6` to `#00a070`.
  Keep `brandStart` (`#8b5cf6`) as-is. Everything using `brandGradient`
  (buttons, toggles, progress fills, avatars, login screen, etc.) picks the
  change up automatically — that app-wide effect is intended; do NOT fork a
  game-only gradient.
- Update the `brandEnd` doc comment ("purple → blue" → "purple → green")
  wherever the gradient is described.

**Known knock-on to resolve (pick the minimal fix):** the Frigate ship color
in `src/games/battleship/setup/ship-placement.constants.ts` is
`colors.brandEnd` (blue today). After the change it becomes brand green and
will collide with the Scout (`colors.success`, `#10b981`). Ships must stay
visually distinguishable — give the Frigate its own local constant (keeping
the old blue `#3b82f6` as a local color is acceptable, same pattern as
`SHIP_DESTROYER_COLOR`), or differentiate the Scout. Do not leave two
near-identical green ships.

**Acceptance:** all gradient surfaces render purple→green matching the icon;
the four ship classes remain clearly distinguishable in the tray, on the
board, and in the enemy-fleet panel; no other hardcoded blues remain that were
meant to be "brand" (search for `#3b82f6` / `brandEnd` usages and audit each).

---

## Constraints

- Tasks 1–6: zero visual or behavioral changes — pixel-identical screens.
  Task 7 changes colors only; layout/behavior still identical.
- No new dependencies.
- Keep the existing patterns: ref-mirroring for PanResponder closures, pure
  helpers in `setup/ship-placement.utils.ts` / `game/powerups.ts`, Skia
  `PathBuilder` (NOT the deprecated `SkPath.moveTo/lineTo` mutators — they
  trigger LogBox warnings).

## Verification checklist

1. `cd apps/mobile && npx tsc --noEmit` — clean.
2. Launch on the simulator and screenshot: setup screen (empty + ships
   placed), battle screen (attack view with shots/markers, fleet view,
   powerups bar with points) — compare against current behavior (identical
   except the task-7 gradient colors).
3. Interactions to re-test by hand: drag-place a ship with live preview,
   rotate pill, tap-to-place, trash/remove, READY → battle, target + FIRE,
   arm torpedo → tap row → LAUNCH, arm bomb → tap area → LAUNCH, hit/miss/sunk
   markers and animations, countdown reset after each shot.
4. No new LogBox warnings (yellow toast in the simulator).
