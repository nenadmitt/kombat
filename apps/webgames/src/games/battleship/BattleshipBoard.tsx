import {
  cellsFor,
  GRID,
  SHIP_BY_ID,
  type MinePlacement,
  type Orientation,
  type Shot,
} from '@gaming-platform/core';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  BombBlast,
  MarkerDefs,
  MineExplosion,
  MineMarker,
  ShotMarker,
  TorpedoProjectile,
} from './BattleshipMarkers';
import type { GridAction, PlacedShip } from './battleship-engine';
import { ShipHull } from './ShipHull';
import {
  ACTIVE_CELL_BORDER,
  BOARD_SIZE,
  CELL,
  CELL_BORDER,
  CELL_RADIUS,
  ENTRY_MS,
  HULL_PAD,
  MINE_BLAST_MS,
  TORPEDO_PER_CELL_MS,
} from './battleship-theme';

const TAP_SLOP = 8;

function midpointOf(cells: { row: number; col: number }[]) {
  const rows = cells.map(cell => cell.row);
  const cols = cells.map(cell => cell.col);
  return {
    row: Math.round((Math.min(...rows) + Math.max(...rows)) / 2),
    col: Math.round((Math.min(...cols) + Math.max(...cols)) / 2),
  };
}

// On the victim's board the blast arrives as plain hits and misses, so the footprint's midpoint names the centre.
function mineCenters(cells: Shot[]) {
  const struck = cells.filter(cell => cell.result === 'mine');
  return struck.length > 0
    ? struck.map(cell => ({ row: cell.row, col: cell.col }))
    : [midpointOf(cells)];
}

type PreviewShip = {
  size: number;
  color: string;
  orientation: Orientation;
};

type Props = {
  ships: PlacedShip[];
  mines?: MinePlacement[];
  shots: Shot[];
  sunkShipIds?: Set<string>;
  highlight?: { row: number; col: number }[];
  selected?: { row: number; col: number } | null;
  preview?: PreviewShip | null;
  isPreviewValid?: (row: number, col: number) => boolean;
  interactive?: boolean;
  action?: GridAction | null;
  /** `isTap` is false for a drag-release, which must never remove a piece. */
  onCommit?: (row: number, col: number, isTap: boolean) => void;
};

type Batch = {
  order: Map<string, number>;
  kind: GridAction['kind'];
  stepMs: number;
  centers: { row: number; col: number }[];
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
  action,
  onCommit,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const movedRef = useRef(false);
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const [batch, setBatch] = useState<Batch | null>(null);
  const actionId = action?.id;
  useEffect(() => {
    if (!action || action.cells.length === 0) return;

    const sorted =
      action.kind === 'torpedo'
        ? [...action.cells].sort((a, b) => a.col - b.col)
        : action.cells;
    const stepMs = action.kind === 'torpedo' ? TORPEDO_PER_CELL_MS : 0;
    const order = new Map(
      sorted.map((cell, index) => [`${cell.row},${cell.col}`, index]),
    );
    const centers =
      action.kind === 'mine'
        ? mineCenters(action.cells)
        : action.kind === 'bomb'
          ? [midpointOf(action.cells)]
          : [];

    setBatch({ order, kind: action.kind, stepMs, centers });
    const duration =
      action.kind === 'mine'
        ? MINE_BLAST_MS
        : action.kind === 'torpedo'
          ? sorted.length * TORPEDO_PER_CELL_MS + ENTRY_MS
          : ENTRY_MS;
    const timer = setTimeout(() => setBatch(null), duration + 40);
    return () => clearTimeout(timer);
    // Keyed by id so firing the same cells twice still replays.
  }, [actionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const torpedoRun = useMemo(() => {
    if (!batch || batch.kind !== 'torpedo' || !action) return null;
    const cols = action.cells.map(cell => cell.col);
    return {
      row: action.cells[0]!.row,
      fromCol: Math.min(...cols),
      toCol: Math.max(...cols),
      sweepMs: action.cells.length * TORPEDO_PER_CELL_MS,
    };
  }, [batch, action]);

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
          enterIndex={batch?.order.get(`${shot.row},${shot.col}`)}
          stepMs={batch?.stepMs}
        />
      ))}

      {batch?.kind === 'bomb' &&
        batch.centers.map(center => (
          <BombBlast key={`bomb-${center.row},${center.col}`} {...center} />
        ))}

      {batch?.kind === 'mine' &&
        batch.centers.map(center => (
          <MineExplosion key={`mine-${center.row},${center.col}`} {...center} />
        ))}

      {torpedoRun && <TorpedoProjectile {...torpedoRun} />}

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
