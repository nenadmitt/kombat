import { useRef, useState } from 'react';
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

import { colors } from '../../theme/colors';
import ShipHull from './ShipHull';
import { GRID } from './setup/ship-placement.constants';
import type { Orientation, Placement, Shot } from './setup/ship-placement.types';
import { cellsFor } from './setup/ship-placement.utils';

// Gap between grid cells and their corner rounding — matches the design's
// spaced, rounded-square grid rather than a continuous ruled grid.
const CELL_GAP = 4;
const CELL_RADIUS = 6;
/** Inset of a ship hull from its cells' outer edge. */
const HULL_PAD = 3;

// Empty cells are a translucent white overlay (like colors.cardBackground)
// rather than an opaque fill, so the screen's background glow shows through —
// matching the design instead of a flat grey grid.
const EMPTY_CELL_GRADIENT = ['rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0.03)'];
const CELL_BORDER = colors.cardBorder;
// Brighter border on empty cells while a ship is selected, inviting a tap.
const ACTIVE_CELL_BORDER = 'rgba(139, 92, 246, 0.55)';
const HIT_FILL = 'rgba(239, 68, 68, 0.9)';
const HIT_GLOW = 'rgba(239, 68, 68, 0.55)';
const MISS_DOT = 'rgba(148, 163, 184, 0.7)';

/** Finger movement below this (px) still counts as a tap, not a drag. */
const TAP_SLOP = 8;

export type PlacedShip = {
  id: string;
  size: number;
  color: string;
  placement: Placement;
};

type Hover = { row: number; col: number; valid: boolean };

type Props = {
  boardSize: number;
  cell: number;
  /** Ships to draw as full hull silhouettes (own fleet, or revealed sunk ships). */
  placedShips?: PlacedShip[];
  /** Hit/miss markers overlaid on cells (gameplay). */
  shots?: Shot[];
  /** Highlighted target cell (attack mode). */
  selectedCell?: { row: number; col: number } | null;
  /** Ship currently selected for placement — drawn hovering under the finger. */
  activeShip?: { size: number; color: string } | null;
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
 *  selected, that ship's silhouette follows — its own color when the spot is
 *  valid, red when not. Releasing commits; a stationary tap on a placed ship
 *  removes it. */
export default function BattleshipGrid({
  boardSize,
  cell,
  placedShips = [],
  shots = [],
  selectedCell = null,
  activeShip = null,
  orientation = 'h',
  isValidPlacement,
  onCommit,
}: Props) {
  const [hover, setHover] = useState<Hover | null>(null);

  // PanResponder is created once, so these keep its handlers reading the
  // latest props/callbacks instead of the ones captured at first render.
  const activeShipRef = useRef(activeShip);
  activeShipRef.current = activeShip;
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
    if (!activeShipRef.current) {
      return;
    }
    const { row, col } = toCell(locationX, locationY);
    setHover({ row, col, valid: isValidRef.current?.(row, col) ?? false });
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
      onPanResponderTerminate: () => setHover(null),
    }),
  ).current;

  const occupied = new Set<string>();
  for (const ship of placedShips) {
    for (const { r, c } of cellsFor(ship.placement, ship.size)) {
      occupied.add(`${r},${c}`);
    }
  }
  const active = activeShip !== null;
  // Only wire up touch handlers when the board is interactive.
  const touchHandlers = onCommit ? responder.panHandlers : {};

  const gridCells = Array.from({ length: GRID * GRID }, (_, i) => {
    const r = Math.floor(i / GRID);
    const c = i % GRID;
    return { r, c, occupied: occupied.has(`${r},${c}`) };
  });

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

        {shots.map(shot => {
          const key = `s${shot.row}-${shot.col}`;
          const cx = shot.col * cell + cell / 2;
          const cy = shot.row * cell + cell / 2;
          if (shot.result === 'miss') {
            return <Circle key={key} cx={cx} cy={cy} r={cell * 0.12} color={MISS_DOT} />;
          }
          // A hit on a cell belonging to a fully-sunk ship (revealed via
          // placedShips → occupied) becomes a red X; a hit on a ship still
          // afloat shows a glowing red circle.
          const isSunkCell = occupied.has(`${shot.row},${shot.col}`);
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
          const x = shot.col * cell + CELL_GAP / 2;
          const y = shot.row * cell + CELL_GAP / 2;
          const size = cell - CELL_GAP;
          const m = size * 0.28; // X arm inset from the cell edge
          return (
            <Group key={key}>
              <RoundedRect x={x} y={y} width={size} height={size} r={CELL_RADIUS} color={HIT_FILL} />
              <Line p1={vec(x + m, y + m)} p2={vec(x + size - m, y + size - m)} color="white" strokeWidth={2} />
              <Line p1={vec(x + size - m, y + m)} p2={vec(x + m, y + size - m)} color="white" strokeWidth={2} />
            </Group>
          );
        })}

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
      </Canvas>
    </View>
  );
}
