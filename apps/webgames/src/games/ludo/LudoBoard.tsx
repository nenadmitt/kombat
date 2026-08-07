import {
  BASE_CORNER,
  BOARD,
  HOME_COLUMN_CELLS,
  SAFE_TRACK_INDICES,
  START_OFFSET,
  TOKENS_PER_PLAYER,
  TRACK_CELLS,
  cellForProgress,
  type LudoColor,
  type LudoTokens,
} from '@gaming-platform/core';
import { memo, useMemo } from 'react';

import { LudoPawn, PAWN_VIEW_H, PAWN_VIEW_W } from './LudoPawn';
import { LUDO_COLOR_HEX, ludoTint } from './ludo-theme';

/** The board is drawn in cell units and scaled by the SVG viewBox. */
const CELL = 10;
const SIZE = BOARD * CELL;
const GAP = CELL * 0.07;
const CELL_RADIUS = CELL * 0.2;

const NEUTRAL_FILL = 'rgba(255, 255, 255, 0.05)';
const NEUTRAL_BORDER = 'rgba(255, 255, 255, 0.6)';

type CellPaint = {
  row: number;
  col: number;
  fill: string;
  border: string;
  star: string | null;
};

/** A 5-point star, as an SVG path centred at (cx, cy). */
function starPath(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(
      `${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)}`,
    );
  }
  return `M${points.join('L')}Z`;
}

/** Static description of every visible arm cell (the cross), derived once. */
const ARM_CELLS: CellPaint[] = (() => {
  const cells: CellPaint[] = [];
  const homeColumn = new Map<string, LudoColor>();
  for (const color of Object.keys(HOME_COLUMN_CELLS) as LudoColor[]) {
    for (const cell of HOME_COLUMN_CELLS[color]) {
      homeColumn.set(`${cell.row},${cell.col}`, color);
    }
  }
  const trackColor = new Map<string, { color: LudoColor | null; star: boolean }>();
  TRACK_CELLS.forEach((cell, idx) => {
    const start = (Object.entries(START_OFFSET) as [LudoColor, number][]).find(
      ([, offset]) => offset === idx,
    );
    trackColor.set(`${cell.row},${cell.col}`, {
      color: start ? start[0] : null,
      star: SAFE_TRACK_INDICES.has(idx),
    });
  });

  const inMid = (v: number) => v >= 6 && v <= 8;
  for (let row = 0; row < BOARD; row++) {
    for (let col = 0; col < BOARD; col++) {
      const mr = inMid(row);
      const mc = inMid(col);
      if ((mr && mc) || (!mr && !mc)) {
        continue; // centre + base corners render as overlays
      }
      const key = `${row},${col}`;
      const color = homeColumn.get(key) ?? trackColor.get(key)?.color ?? null;
      const star = trackColor.get(key)?.star ?? false;
      cells.push({
        row,
        col,
        fill: color ? ludoTint(color, 0.2) : NEUTRAL_FILL,
        border: color ? LUDO_COLOR_HEX[color] : NEUTRAL_BORDER,
        star: star
          ? color
            ? 'rgba(255, 255, 255, 0.9)'
            : 'rgba(255, 255, 255, 0.6)'
          : null,
      });
    }
  }
  return cells;
})();

/** Centre of a base slot (2x2 grid inside the corner) for a token index. */
function baseSlotCenter(
  color: LudoColor,
  tokenIndex: number,
): { x: number; y: number } {
  const [rowStart, colStart] = BASE_CORNER[color];
  const size = 6 * CELL;
  const colIdx = tokenIndex % 2;
  const rowIdx = Math.floor(tokenIndex / 2);
  return {
    x: colStart * CELL + size * (0.31 + colIdx * 0.38),
    y: rowStart * CELL + size * (0.31 + rowIdx * 0.38),
  };
}

type Props = {
  /** Colours actually seated this match (2-4). */
  seatedColors: LudoColor[];
  tokens: LudoTokens;
  eliminated?: LudoColor[];
  /** My colour + my movable token indices - those pawns glow and take clicks. */
  myColor?: LudoColor;
  movableTokens?: number[];
  onTokenPick?: (tokenIndex: number) => void;
};

/**
 * The 15x15 board: coloured arm cells with safe-cell stars, four base corners
 * with 2x2 pawn slots, the four-triangle centre, and pawns over their cells.
 * Movable pawns pulse and take a click.
 */
function LudoBoardView({
  seatedColors,
  tokens,
  eliminated = [],
  myColor,
  movableTokens = [],
  onTokenPick,
}: Props) {
  /** Board-space anchor (pawn centre) for every token of a colour. */
  const anchors = useMemo(() => {
    const list: {
      color: LudoColor;
      tokenIndex: number;
      x: number;
      y: number;
    }[] = [];
    for (const color of seatedColors) {
      const progresses = tokens[color] ?? [];
      // Group on-track tokens by cell so stacked pawns fan out slightly.
      const byCell = new Map<string, number[]>();
      progresses.forEach((p, tokenIndex) => {
        const cell = cellForProgress(color, p);
        if (cell) {
          const key = `${cell.row},${cell.col}`;
          byCell.set(key, [...(byCell.get(key) ?? []), tokenIndex]);
        }
      });
      progresses.forEach((p, tokenIndex) => {
        if (p === -1) {
          list.push({ color, tokenIndex, ...baseSlotCenter(color, tokenIndex) });
          return;
        }
        const cell = cellForProgress(color, p);
        if (!cell) {
          return; // home - the HUD counts it, the board does not draw it
        }
        const stack = byCell.get(`${cell.row},${cell.col}`)!;
        const fan =
          stack.length > 1 ? stack.indexOf(tokenIndex) - (stack.length - 1) / 2 : 0;
        list.push({
          color,
          tokenIndex,
          x: (cell.col + 0.5) * CELL + fan * CELL * 0.38,
          y: (cell.row + 0.5) * CELL - Math.abs(fan) * CELL * 0.06,
        });
      });
    }
    return list;
  }, [seatedColors, tokens]);

  const movableSet = new Set(movableTokens);
  const pawnW = CELL;
  const pawnH = (pawnW / PAWN_VIEW_W) * PAWN_VIEW_H;

  const c0 = 6 * CELL;
  const c1 = 9 * CELL;
  const cm = 7.5 * CELL;

  return (
    <svg className="ludo-board" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img">
      {ARM_CELLS.map(({ row, col, fill, border, star }) => {
        const x = col * CELL + GAP / 2;
        const y = row * CELL + GAP / 2;
        const size = CELL - GAP;
        return (
          <g key={`${row},${col}`}>
            <rect
              x={x}
              y={y}
              width={size}
              height={size}
              rx={CELL_RADIUS}
              fill={fill}
              stroke={border}
              strokeWidth={CELL * 0.065}
            />
            {star && (
              <path d={starPath(x + size / 2, y + size / 2, size * 0.28)} fill={star} />
            )}
          </g>
        );
      })}

      {(Object.keys(BASE_CORNER) as LudoColor[]).map(color => (
        <BaseCorner
          key={color}
          color={color}
          seated={seatedColors.includes(color)}
          dimmed={eliminated.includes(color)}
        />
      ))}

      {/* Centre: the four home triangles plus the finish star. */}
      <path d={`M${c0},${c0}L${c1},${c0}L${cm},${cm}Z`} fill={LUDO_COLOR_HEX.green} />
      <path d={`M${c1},${c0}L${c1},${c1}L${cm},${cm}Z`} fill={LUDO_COLOR_HEX.yellow} />
      <path d={`M${c1},${c1}L${c0},${c1}L${cm},${cm}Z`} fill={LUDO_COLOR_HEX.blue} />
      <path d={`M${c0},${c1}L${c0},${c0}L${cm},${cm}Z`} fill={LUDO_COLOR_HEX.red} />
      <path d={starPath(cm, cm, CELL * 0.55)} fill="rgba(255, 255, 255, 0.92)" />

      {anchors.map(anchor => {
        const movable =
          anchor.color === myColor && movableSet.has(anchor.tokenIndex);
        return (
          <g
            key={`${anchor.color}-${anchor.tokenIndex}`}
            className={movable ? 'ludo-pawn is-movable' : 'ludo-pawn'}
            transform={`translate(${anchor.x - pawnW / 2} ${anchor.y - pawnH * 0.62})`}
            onClick={movable ? () => onTokenPick?.(anchor.tokenIndex) : undefined}
          >
            {movable && (
              <circle
                className="ludo-pawn-glow"
                cx={pawnW / 2}
                cy={pawnH * 0.62}
                r={CELL * 0.62}
                fill={ludoTint(anchor.color, 0.55)}
              />
            )}
            <LudoPawn
              width={pawnW}
              color={LUDO_COLOR_HEX[anchor.color]}
              opacity={eliminated.includes(anchor.color) ? 0.35 : 1}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** One 6x6 base corner: tinted rounded frame, dark inner panel, 2x2 slots. */
function BaseCorner({
  color,
  seated,
  dimmed,
}: {
  color: LudoColor;
  seated: boolean;
  dimmed: boolean;
}) {
  const [rowStart, colStart] = BASE_CORNER[color];
  const inset = CELL * 0.12;
  const x = colStart * CELL + inset;
  const y = rowStart * CELL + inset;
  const size = 6 * CELL - inset * 2;

  return (
    <g opacity={!seated ? 0.28 : dimmed ? 0.35 : 1}>
      <rect
        x={x}
        y={y}
        width={size}
        height={size}
        rx={CELL * 0.75}
        fill={ludoTint(color, 0.18)}
        stroke={ludoTint(color, 0.85)}
        strokeWidth={CELL * 0.065}
      />
      <rect
        x={x + size * 0.09}
        y={y + size * 0.09}
        width={size * 0.82}
        height={size * 0.82}
        rx={CELL * 0.5}
        fill="rgba(8, 6, 14, 0.4)"
      />
      {Array.from({ length: TOKENS_PER_PLAYER }, (_, i) => {
        const { x: cx, y: cy } = baseSlotCenter(color, i);
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={CELL * 0.78}
            fill={ludoTint(color, 0.14)}
            stroke={ludoTint(color, 0.7)}
            strokeWidth={CELL * 0.087}
          />
        );
      })}
    </g>
  );
}

export const LudoBoard = memo(LudoBoardView);
