import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Line,
  LinearGradient,
  RoundedRect,
  vec,
} from '@shopify/react-native-skia';
import { useSharedValue, withTiming } from 'react-native-reanimated';

import type { MinePlacement } from '@gaming-platform/core';

import { colors } from '../../theme/colors';
import {
  AnimatedShot,
  BombBlast,
  MineExplosion,
  MineMarker,
  TorpedoProjectile,
  type MarkerKind,
} from './battleship-markers';
import ShipHull from './ShipHull';
import { GRID } from './setup/ship-placement.constants';
import type { Orientation, Placement, Shot } from './setup/ship-placement.types';
import { cellsFor } from './setup/ship-placement.utils';

// Gap between grid cells and their corner rounding - matches the design's
// spaced, rounded-square grid rather than a continuous ruled grid.
const CELL_GAP = 4;
const CELL_RADIUS = 6;
/** Inset of a ship hull from its cells' outer edge. */
const HULL_PAD = 3;

// Empty cells are a translucent white overlay (like colors.cardBackground)
// rather than an opaque fill, so the screen's background glow shows through -
// matching the design instead of a flat grey grid.
const EMPTY_CELL_GRADIENT = ['rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0.03)'];
const CELL_BORDER = colors.cardBorder;
// Brighter border on empty cells while a ship is selected, inviting a tap.
const ACTIVE_CELL_BORDER = 'rgba(124, 92, 255, 0.55)';
const HIT_FILL = 'rgba(255, 84, 104, 0.9)';
const HIT_GLOW = 'rgba(255, 84, 104, 0.55)';
const MISS_DOT = 'rgba(148, 163, 184, 0.7)';

/** Finger movement below this (px) still counts as a tap, not a drag. */
const TAP_SLOP = 8;

export type PlacedShip = {
  id: string;
  size: number;
  color: string;
  placement: Placement;
};

/** The most recent shot batch, replayed as an entrance animation. `id` bumps
 *  every action so repeats still animate. Torpedo cells reveal left→right with
 *  a projectile; single/bomb cells pop in together; `mine` is a triggered
 *  mine's blast - its cells pop in under an expanding yellow explosion. */
export type GridAction = {
  id: number;
  kind: 'single' | 'torpedo' | 'bomb' | 'mine';
  cells: Shot[];
};

const ENTRY_MS = 300;
/** A mine blast's expanding-circle explosion plays slower for drama. */
const MINE_BLAST_MS = 900;
const TORPEDO_PER_CELL_MS = 90;
const SINK_PER_CELL_MS = 150;

type Hover = { row: number; col: number; valid: boolean };
type ActiveBatch = { keys: Set<string>; cells: Shot[]; kind: GridAction['kind'] };
type SinkBatch = { keys: string[] };
type Projectile = { row: number; fromCol: number; toCol: number };

type Props = {
  boardSize: number;
  cell: number;
  /** Ships to draw as full hull silhouettes (own fleet, or revealed sunk ships). */
  placedShips?: PlacedShip[];
  /** Armed sea mines to draw (setup + own-fleet views). */
  mines?: MinePlacement[];
  /** Hit/miss/mine markers overlaid on cells (gameplay). */
  shots?: Shot[];
  /** Highlighted target cell (attack mode). */
  selectedCell?: { row: number; col: number } | null;
  /** Cells a queued power-up would strike, outlined as a preview. */
  previewCells?: { row: number; col: number }[];
  /** Most recent shot batch to animate in (gameplay). */
  action?: GridAction | null;
  /** Ship currently selected for placement - drawn hovering under the finger. */
  activeShip?: { size: number; color: string } | null;
  /** Whether a mine is being placed - drawn hovering under the finger. */
  activeMine?: boolean;
  orientation?: Orientation;
  /** Whether the active ship may be placed anchored at (row, col). */
  isValidPlacement?: (row: number, col: number) => boolean;
  /** Fired on touch release. `isTap` is true for a stationary press (no drag),
   *  letting the owner treat taps (remove) and drops (place) differently.
   *  Omit to make the board read-only (e.g. the fleet view). */
  onCommit?: (row: number, col: number, isTap: boolean) => void;
};

/** The 10x10 board. Placed ships render as hull silhouettes across their
 *  cells. While a finger (or mouse hover) moves over the grid with a ship
 *  selected, that ship's silhouette follows - its own color when the spot is
 *  valid, red when not. Releasing commits; a stationary tap on a placed ship
 *  removes it. */
function BattleshipGrid({
  boardSize,
  cell,
  placedShips = [],
  mines = [],
  shots = [],
  selectedCell = null,
  previewCells,
  action = null,
  activeShip = null,
  activeMine = false,
  orientation = 'h',
  isValidPlacement,
  onCommit,
}: Props) {
  const [hover, setHover] = useState<Hover | null>(null);

  // PanResponder is created once, so these keep its handlers reading the
  // latest props/callbacks instead of the ones captured at first render.
  const activeShipRef = useRef(activeShip);
  activeShipRef.current = activeShip;
  const activeMineRef = useRef(activeMine);
  activeMineRef.current = activeMine;
  const isValidRef = useRef(isValidPlacement);
  isValidRef.current = isValidPlacement;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const movedRef = useRef(false);

  const toCell = (locationX: number, locationY: number) => ({
    row: Math.floor(locationY / cell),
    col: Math.floor(locationX / cell),
  });

  const updateHover = (locationX: number, locationY: number) => {
    if (!activeShipRef.current && !activeMineRef.current) {
      return;
    }
    const { row, col } = toCell(locationX, locationY);
    const valid = isValidRef.current?.(row, col) ?? false;
    // Bail out when the finger is still over the same cell - returning the
    // previous state reference makes React skip the (expensive) grid re-render.
    setHover(prev =>
      prev && prev.row === row && prev.col === col && prev.valid === valid
        ? prev
        : { row, col, valid },
    );
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => {
        movedRef.current = false;
        updateHover(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },
      onPanResponderMove: (e, g) => {
        if (Math.abs(g.dx) + Math.abs(g.dy) > TAP_SLOP) {
          movedRef.current = true;
        }
        updateHover(e.nativeEvent.locationX, e.nativeEvent.locationY);
      },
      onPanResponderRelease: e => {
        const { row, col } = toCell(e.nativeEvent.locationX, e.nativeEvent.locationY);
        onCommitRef.current?.(row, col, !movedRef.current);
        setHover(null);
      },
      // Keep the gesture when an enclosing ScrollView asks to take over -
      // otherwise dragging a ship down the board scrolls the screen instead.
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => setHover(null),
    }),
  ).current;

  const occupied = useMemo(() => {
    const set = new Set<string>();
    for (const ship of placedShips) {
      for (const { r, c } of cellsFor(ship.placement, ship.size)) {
        set.add(`${r},${c}`);
      }
    }
    return set;
  }, [placedShips]);
  // Cells that belong to a *fully destroyed* ship (every cell hit). Only these
  // render as the red X - a hit on a ship still afloat stays a glowing circle.
  // (On the fleet view `placedShips` is the whole fleet, so keying "sunk" off
  //  `occupied` would wrongly X-out every incoming hit.)
  const sunkCells = useMemo(() => {
    const hitKeys = new Set(
      shots.filter(s => s.result === 'hit').map(s => `${s.row},${s.col}`),
    );
    const set = new Set<string>();
    for (const ship of placedShips) {
      const cells = cellsFor(ship.placement, ship.size);
      if (cells.every(({ r, c }) => hitKeys.has(`${r},${c}`))) {
        for (const { r, c } of cells) set.add(`${r},${c}`);
      }
    }
    return set;
  }, [placedShips, shots]);
  const active = activeShip !== null || activeMine;
  // Only wire up touch handlers when the board is interactive.
  const touchHandlers = onCommit ? responder.panHandlers : {};

  // --- entrance / sink / torpedo animations --------------------------------
  const entry = useSharedValue(1);
  const sink = useSharedValue(1);
  const torpedo = useSharedValue(0);

  const [batch, setBatch] = useState<ActiveBatch | null>(null);
  const [sinkBatch, setSinkBatch] = useState<SinkBatch | null>(null);
  const [projectile, setProjectile] = useState<Projectile | null>(null);

  // Play the entrance animation for the newest action (single/bomb pop in
  // together; a torpedo reveals left→right behind a moving projectile).
  useEffect(() => {
    if (!action || action.cells.length === 0) {
      return;
    }
    const keys = new Set(action.cells.map(c => `${c.row},${c.col}`));
    setBatch({ keys, cells: action.cells, kind: action.kind });

    let duration = action.kind === 'mine' ? MINE_BLAST_MS : ENTRY_MS;
    if (action.kind === 'torpedo') {
      const cols = action.cells.map(c => c.col);
      setProjectile({
        row: action.cells[0]!.row,
        fromCol: Math.min(...cols),
        toCol: Math.max(...cols),
      });
      const sweep = action.cells.length * TORPEDO_PER_CELL_MS;
      duration = sweep + ENTRY_MS;
      torpedo.value = 0;
      torpedo.value = withTiming(1, { duration: sweep });
    }
    entry.value = 0;
    entry.value = withTiming(1, { duration });

    const clear = setTimeout(() => {
      setBatch(null);
      setProjectile(null);
    }, duration + 40);
    return () => clearTimeout(clear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action?.id]);

  // Animate ships as they sink: their cells form X squares left→right.
  const sunkIds = useMemo(
    () => placedShips.map(s => s.id).sort().join(','),
    [placedShips],
  );
  const prevSunkRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevSunkRef.current;
    prevSunkRef.current = sunkIds;
    if (prev === null || sunkIds === prev) {
      return;
    }
    const prevSet = new Set(prev ? prev.split(',') : []);
    const newlySunk = placedShips.filter(s => !prevSet.has(s.id));
    if (newlySunk.length === 0) {
      return;
    }
    const keys: string[] = [];
    for (const s of newlySunk) {
      for (const { r, c } of cellsFor(s.placement, s.size)) {
        keys.push(`${r},${c}`);
      }
    }
    setSinkBatch({ keys });
    const duration = keys.length * SINK_PER_CELL_MS;
    sink.value = 0;
    sink.value = withTiming(1, { duration });
    const clear = setTimeout(() => setSinkBatch(null), duration + 40);
    return () => clearTimeout(clear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sunkIds]);

  const gridCells = useMemo(
    () =>
      Array.from({ length: GRID * GRID }, (_, i) => {
        const r = Math.floor(i / GRID);
        const c = i % GRID;
        return { r, c, occupied: occupied.has(`${r},${c}`) };
      }),
    [occupied],
  );

  const renderShip = (
    key: string,
    row: number,
    col: number,
    size: number,
    color: string,
    shipOrientation: Orientation,
    opacity?: number,
  ) => {
    const thickness = cell - HULL_PAD * 2;
    const length = size * cell - HULL_PAD * 2;
    const x = col * cell + HULL_PAD;
    const y = row * cell + HULL_PAD;
    // Hulls are drawn horizontally at the origin; vertical ships are the same
    // hull rotated -90° (bow pointing up) into the cells' bounding box.
    const transform =
      shipOrientation === 'h'
        ? [{ translateX: x }, { translateY: y }]
        : [{ translateX: x }, { translateY: y + length }, { rotate: -Math.PI / 2 }];
    return (
      <Group key={key} transform={transform} opacity={opacity}>
        <ShipHull length={length} thickness={thickness} cells={size} color={color} />
      </Group>
    );
  };

  return (
    <View
      style={{ width: boardSize, height: boardSize }}
      {...touchHandlers}
      onPointerMove={e => updateHover(e.nativeEvent.offsetX, e.nativeEvent.offsetY)}
      onPointerLeave={() => setHover(null)}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        {gridCells.map(({ r, c, occupied: isOccupied }) => {
          const x = c * cell + CELL_GAP / 2;
          const y = r * cell + CELL_GAP / 2;
          const size = cell - CELL_GAP;
          return (
            <Group key={`${r},${c}`}>
              <RoundedRect x={x} y={y} width={size} height={size} r={CELL_RADIUS}>
                <LinearGradient
                  start={vec(0, y)}
                  end={vec(0, y + size)}
                  colors={EMPTY_CELL_GRADIENT}
                />
              </RoundedRect>
              <RoundedRect
                x={x}
                y={y}
                width={size}
                height={size}
                r={CELL_RADIUS}
                style="stroke"
                strokeWidth={1}
                color={!isOccupied && active ? ACTIVE_CELL_BORDER : CELL_BORDER}
              />
            </Group>
          );
        })}

        {placedShips.map(ship =>
          renderShip(
            ship.id,
            ship.placement.row,
            ship.placement.col,
            ship.size,
            ship.color,
            ship.placement.orientation,
          ),
        )}

        {mines.map(m => (
          <MineMarker
            key={`m${m.row},${m.col}`}
            cx={m.col * cell + cell / 2}
            cy={m.row * cell + cell / 2}
            cellSize={cell - CELL_GAP}
          />
        ))}

        {shots.map(shot => {
          const cellKey = `${shot.row},${shot.col}`;
          const key = `s${cellKey}`;
          const cx = shot.col * cell + cell / 2;
          const cy = shot.row * cell + cell / 2;
          const cellX = shot.col * cell + CELL_GAP / 2;
          const cellY = shot.row * cell + CELL_GAP / 2;
          const size = cell - CELL_GAP;
          const isSunkCell = sunkCells.has(cellKey);
          // A sinking ship's cells animate their X formation left→right.
          const sinkIdx = sinkBatch ? sinkBatch.keys.indexOf(cellKey) : -1;
          if (sinkIdx !== -1) {
            const n = sinkBatch!.keys.length;
            return (
              <AnimatedShot
                key={key}
                kind="sunk"
                cellX={cellX}
                cellY={cellY}
                cellSize={size}
                cx={cx}
                cy={cy}
                progress={sink}
                windowStart={sinkIdx / n}
                windowEnd={(sinkIdx + 1) / n}
              />
            );
          }
          // A freshly-fired cell plays its entrance animation.
          if (batch && batch.keys.has(cellKey)) {
            const markerKind: MarkerKind =
              shot.result === 'mine'
                ? 'mine'
                : isSunkCell
                  ? 'sunk'
                  : shot.result === 'hit'
                    ? 'hit'
                    : 'miss';
            const stagger = batch.kind === 'torpedo';
            const idx = stagger
              ? batch.cells.findIndex(c => `${c.row},${c.col}` === cellKey)
              : 0;
            const n = stagger ? batch.cells.length : 1;
            return (
              <AnimatedShot
                key={key}
                kind={markerKind}
                cellX={cellX}
                cellY={cellY}
                cellSize={size}
                cx={cx}
                cy={cy}
                progress={entry}
                windowStart={stagger ? idx / n : 0}
                windowEnd={stagger ? (idx + 1) / n : 1}
              />
            );
          }
          // Settled markers render statically. A mine in the shot log has
          // gone off, so it renders blown open (dark hole in the core).
          if (shot.result === 'mine') {
            return (
              <MineMarker
                key={key}
                cx={cx}
                cy={cy}
                cellSize={size}
                exploded
              />
            );
          }
          if (shot.result === 'miss') {
            return <Circle key={key} cx={cx} cy={cy} r={cell * 0.12} color={MISS_DOT} />;
          }
          // A hit on a fully-sunk ship becomes a red X; a hit on a ship still
          // afloat shows a glowing red circle.
          if (!isSunkCell) {
            return (
              <Group key={key}>
                <Circle cx={cx} cy={cy} r={cell * 0.24} color={HIT_GLOW}>
                  <BlurMask blur={5} style="normal" />
                </Circle>
                <Circle cx={cx} cy={cy} r={cell * 0.15} color={HIT_FILL} />
              </Group>
            );
          }
          const m = size * 0.28; // X arm inset from the cell edge
          return (
            <Group key={key}>
              <RoundedRect x={cellX} y={cellY} width={size} height={size} r={CELL_RADIUS} color={HIT_FILL} />
              <Line p1={vec(cellX + m, cellY + m)} p2={vec(cellX + size - m, cellY + size - m)} color="white" strokeWidth={2} />
              <Line p1={vec(cellX + size - m, cellY + m)} p2={vec(cellX + m, cellY + size - m)} color="white" strokeWidth={2} />
            </Group>
          );
        })}

        {batch?.kind === 'bomb' &&
          batch.cells.map(c => (
            <BombBlast
              key={`blast${c.row}-${c.col}`}
              cx={c.col * cell + cell / 2}
              cy={c.row * cell + cell / 2}
              cellSize={cell - CELL_GAP}
              progress={entry}
            />
          ))}

        {batch?.kind === 'mine' && batch.cells.length > 0 && (
          <MineExplosion
            // Center of the blast area (its cells' bounding box).
            cx={
              ((Math.min(...batch.cells.map(c => c.col)) +
                Math.max(...batch.cells.map(c => c.col))) /
                2 +
                0.5) *
              cell
            }
            cy={
              ((Math.min(...batch.cells.map(c => c.row)) +
                Math.max(...batch.cells.map(c => c.row))) /
                2 +
                0.5) *
              cell
            }
            cellSize={cell}
            progress={entry}
          />
        )}

        {projectile && (
          <TorpedoProjectile
            row={projectile.row}
            fromCol={projectile.fromCol}
            toCol={projectile.toCol}
            cell={cell}
            progress={torpedo}
          />
        )}

        {selectedCell && (
          <RoundedRect
            x={selectedCell.col * cell + CELL_GAP / 2}
            y={selectedCell.row * cell + CELL_GAP / 2}
            width={cell - CELL_GAP}
            height={cell - CELL_GAP}
            r={CELL_RADIUS}
            style="stroke"
            strokeWidth={2.5}
            color={colors.brandStart}
          />
        )}

        {previewCells?.map(pc => (
          <RoundedRect
            key={`pv${pc.row}-${pc.col}`}
            x={pc.col * cell + CELL_GAP / 2}
            y={pc.row * cell + CELL_GAP / 2}
            width={cell - CELL_GAP}
            height={cell - CELL_GAP}
            r={CELL_RADIUS}
            style="stroke"
            strokeWidth={2}
            color={ACTIVE_CELL_BORDER}
          />
        ))}

        {hover &&
          activeShip &&
          renderShip(
            'hover',
            hover.row,
            hover.col,
            activeShip.size,
            hover.valid ? activeShip.color : colors.danger,
            orientation,
            0.85,
          )}

        {hover && !activeShip && activeMine && (
          <MineMarker
            cx={hover.col * cell + cell / 2}
            cy={hover.row * cell + cell / 2}
            cellSize={cell - CELL_GAP}
            opacity={0.85}
            color={hover.valid ? undefined : colors.danger}
          />
        )}
      </Canvas>
    </View>
  );
}

export default memo(BattleshipGrid);
