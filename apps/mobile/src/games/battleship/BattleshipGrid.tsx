import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import {
  Canvas,
  Group,
  LinearGradient,
  RoundedRect,
  vec,
} from '@shopify/react-native-skia';

import { colors } from '../../theme/colors';
import { GRID } from './setup/ship-placement.constants';
import type { Cell } from './setup/ship-placement.types';

// Gap between grid cells and their corner rounding — matches the design's
// spaced, rounded-square grid rather than a continuous ruled grid.
const CELL_GAP = 4;
const CELL_RADIUS = 6;

function lighten(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (value >> 16) + amount);
  const g = Math.min(255, ((value >> 8) & 0xff) + amount);
  const b = Math.min(255, (value & 0xff) + amount);
  return `rgb(${r}, ${g}, ${b})`;
}

// Empty cells are a translucent white overlay (like colors.cardBackground)
// rather than an opaque fill, so the screen's background glow shows through —
// matching the design instead of a flat grey grid.
const EMPTY_CELL_GRADIENT = ['rgba(255, 255, 255, 0.07)', 'rgba(255, 255, 255, 0.03)'];
const OCCUPIED_CELL_GRADIENT = [lighten(colors.brandStart, 30), colors.brandStart];
const CELL_BORDER = colors.cardBorder;
// Brighter border on empty cells while a ship is selected, inviting a tap.
const ACTIVE_CELL_BORDER = 'rgba(139, 92, 246, 0.55)';
const VALID_PREVIEW_COLOR = 'rgba(34, 197, 94, 0.55)';
const INVALID_PREVIEW_COLOR = 'rgba(239, 68, 68, 0.55)';

type Preview = { cells: Cell[]; valid: boolean } | null;

type Props = {
  boardSize: number;
  cell: number;
  occupied: Set<string>;
  /** Highlights empty cells to invite a tap — true while a ship is selected for placement. */
  active: boolean;
  /** Cells + validity the active ship would occupy if placed anchored at (row, col). */
  getPreview: (row: number, col: number) => Preview;
  /** Fired on touch release — places the active ship, or removes whatever occupies the cell. */
  onCommit: (row: number, col: number) => void;
};

/** The 10x10 placement board: gradient/bordered cells, occupied-cell fill, and a
 *  live green/red preview while a finger is down over the grid. Releasing commits
 *  the placement (or removes whatever ship occupies the released-on cell). */
export default function BattleshipGrid({
  boardSize,
  cell,
  occupied,
  active,
  getPreview,
  onCommit,
}: Props) {
  const [preview, setPreview] = useState<Preview>(null);

  // PanResponder is created once, so these keep its handlers reading the
  // latest props/callbacks instead of the ones captured at first render.
  const getPreviewRef = useRef(getPreview);
  getPreviewRef.current = getPreview;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const toCell = (locationX: number, locationY: number) => ({
    row: Math.floor(locationY / cell),
    col: Math.floor(locationX / cell),
  });

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => {
        const { row, col } = toCell(e.nativeEvent.locationX, e.nativeEvent.locationY);
        setPreview(getPreviewRef.current(row, col));
      },
      onPanResponderMove: e => {
        const { row, col } = toCell(e.nativeEvent.locationX, e.nativeEvent.locationY);
        setPreview(getPreviewRef.current(row, col));
      },
      onPanResponderRelease: e => {
        const { row, col } = toCell(e.nativeEvent.locationX, e.nativeEvent.locationY);
        onCommitRef.current(row, col);
        setPreview(null);
      },
      onPanResponderTerminate: () => setPreview(null),
    }),
  ).current;

  const gridCells = Array.from({ length: GRID * GRID }, (_, i) => {
    const r = Math.floor(i / GRID);
    const c = i % GRID;
    return { r, c, occupied: occupied.has(`${r},${c}`) };
  });
  const previewColor = preview?.valid ? VALID_PREVIEW_COLOR : INVALID_PREVIEW_COLOR;
  const previewCells =
    preview?.cells.filter(({ r, c }) => r >= 0 && r < GRID && c >= 0 && c < GRID) ?? [];

  return (
    <View
      style={{ width: boardSize, height: boardSize }}
      {...responder.panHandlers}
      onPointerMove={e => {
        const { row, col } = toCell(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
        setPreview(getPreviewRef.current(row, col));
      }}
      onPointerLeave={() => setPreview(null)}
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
                  colors={isOccupied ? OCCUPIED_CELL_GRADIENT : EMPTY_CELL_GRADIENT}
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

        {previewCells.map(({ r, c }) => (
          <RoundedRect
            key={`preview-${r}-${c}`}
            x={c * cell + CELL_GAP / 2}
            y={r * cell + CELL_GAP / 2}
            width={cell - CELL_GAP}
            height={cell - CELL_GAP}
            r={CELL_RADIUS}
            color={previewColor}
          />
        ))}
      </Canvas>
    </View>
  );
}
