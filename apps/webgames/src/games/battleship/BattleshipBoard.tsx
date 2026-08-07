import {
  cellsFor,
  GRID,
  SHIP_BY_ID,
  type MinePlacement,
  type Orientation,
  type Shot,
} from '@gaming-platform/core';
import { useMemo, useRef, useState } from 'react';

import { MarkerDefs, MineMarker, ShotMarker } from './BattleshipMarkers';
import type { PlacedShip } from './battleship-engine';
import { ShipHull } from './ShipHull';
import {
  ACTIVE_CELL_BORDER,
  BOARD_SIZE,
  CELL,
  CELL_BORDER,
  CELL_RADIUS,
  HULL_PAD,
} from './battleship-theme';

/** A drag that moves further than this is a placement, not a tap. */
const TAP_SLOP = 8;

type PreviewShip = {
  size: number;
  color: string;
  orientation: Orientation;
};

type Props = {
  ships: PlacedShip[];
  mines?: MinePlacement[];
  shots: Shot[];
  /** Ship ids already fully sunk, so their cells read as wreckage. */
  sunkShipIds?: Set<string>;
  /** Cells to outline, e.g. a power-up's blast footprint. */
  highlight?: { row: number; col: number }[];
  selected?: { row: number; col: number } | null;
  /** Ship following the pointer during fleet placement. */
  preview?: PreviewShip | null;
  /** Whether a preview at the hovered cell would be legal. */
  isPreviewValid?: (row: number, col: number) => boolean;
  interactive?: boolean;
  /** `isTap` is false for a drag-release, which must never remove a piece. */
  onCommit?: (row: number, col: number, isTap: boolean) => void;
};

export function BattleshipBoard({
  ships,
  mines = [],
  shots,
  sunkShipIds,
  highlight,
  selected,
  preview,
  isPreviewValid,
  interactive = false,
  onCommit,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const movedRef = useRef(false);
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const shipCells = useMemo(() => {
    const map = new Map<string, string>();
    for (const ship of ships) {
      for (const cell of cellsFor(ship.placement, ship.size)) {
        map.set(`${cell.r},${cell.c}`, ship.id);
      }
    }
    return map;
  }, [ships]);


  const highlightSet = useMemo(
    () => new Set((highlight ?? []).map(c => `${c.row},${c.col}`)),
    [highlight],
  );

  /** Pointer position to a board cell, or null when outside the grid. */
  function cellFrom(event: React.PointerEvent): { row: number; col: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scale = BOARD_SIZE / rect.width;
    const x = (event.clientX - rect.left) * scale;
    const y = (event.clientY - rect.top) * scale;
    const col = Math.floor(x / CELL);
    const row = Math.floor(y / CELL);
    if (row < 0 || col < 0 || row >= GRID || col >= GRID) return null;
    return { row, col };
  }

  function handleDown(event: React.PointerEvent) {
    if (!interactive) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = { x: event.clientX, y: event.clientY };
    movedRef.current = false;
    setHover(cellFrom(event));
  }

  function handleMove(event: React.PointerEvent) {
    if (!interactive) return;
    const start = startRef.current;
    if (start) {
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.hypot(dx, dy) > TAP_SLOP) movedRef.current = true;
    }
    setHover(cellFrom(event));
  }

  function handleUp(event: React.PointerEvent) {
    if (!interactive) return;
    const cell = cellFrom(event);
    startRef.current = null;
    if (cell) onCommit?.(cell.row, cell.col, !movedRef.current);
    setHover(null);
  }

  const previewCells =
    preview && hover
      ? cellsFor(
          { row: hover.row, col: hover.col, orientation: preview.orientation },
          preview.size,
        )
      : [];
  const previewValid =
    preview && hover ? (isPreviewValid?.(hover.row, hover.col) ?? true) : false;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
      className="bs-board"
      style={{ touchAction: 'none', cursor: interactive ? 'pointer' : 'default' }}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerLeave={() => setHover(null)}
    >
      <MarkerDefs />

      {Array.from({ length: GRID * GRID }, (_, index) => {
        const row = Math.floor(index / GRID);
        const col = index % GRID;
        const key = `${row},${col}`;
        const isPreview = previewCells.some(c => c.r === row && c.c === col);
        const isSelected = selected?.row === row && selected?.col === col;
        return (
          <rect
            key={key}
            x={col * CELL + 2}
            y={row * CELL + 2}
            width={CELL - 4}
            height={CELL - 4}
            rx={CELL_RADIUS}
            fill="url(#bs-cell)"
            stroke={
              isSelected || highlightSet.has(key)
                ? ACTIVE_CELL_BORDER
                : isPreview
                  ? previewValid
                    ? ACTIVE_CELL_BORDER
                    : 'var(--loss)'
                  : CELL_BORDER
            }
            strokeWidth={isSelected || isPreview || highlightSet.has(key) ? 1.5 : 1}
          />
        );
      })}

      {ships.map(ship => (
        <ShipSprite
          key={ship.id}
          ship={ship}
          sunk={sunkShipIds?.has(ship.id) ?? false}
        />
      ))}

      {preview && hover && (
        <ShipSprite
          ship={{
            id: 'preview',
            size: preview.size,
            color: previewValid ? preview.color : 'var(--loss)',
            placement: {
              row: hover.row,
              col: hover.col,
              orientation: preview.orientation,
            },
          }}
          sunk={false}
          opacity={0.55}
        />
      )}

      {mines.map(mine => (
        <MineMarker key={`${mine.row},${mine.col}`} row={mine.row} col={mine.col} />
      ))}

      {shots.map(shot => (
        <ShotMarker
          key={`${shot.row},${shot.col}`}
          shot={shot}
          sunk={
            shot.result === 'hit' &&
            (sunkShipIds?.has(shipCells.get(`${shot.row},${shot.col}`) ?? '') ??
              false)
          }
        />
      ))}

    </svg>
  );
}

function ShipSprite({
  ship,
  sunk,
  opacity,
}: {
  ship: PlacedShip;
  sunk: boolean;
  opacity?: number;
}) {
  const size = ship.size || SHIP_BY_ID[ship.id]?.size || 1;
  const thickness = CELL - HULL_PAD * 2;
  const length = size * CELL - HULL_PAD * 2;
  const x = ship.placement.col * CELL + HULL_PAD;
  const y = ship.placement.row * CELL + HULL_PAD;

  // A vertical ship is the same hull rotated about its stern.
  const transform =
    ship.placement.orientation === 'h'
      ? `translate(${x}, ${y})`
      : `translate(${x}, ${y + length}) rotate(-90)`;

  return (
    <g transform={transform} opacity={opacity ?? (sunk ? 0.55 : 1)}>
      <ShipHull
        length={length}
        thickness={thickness}
        cells={size}
        color={ship.color}
      />
    </g>
  );
}
