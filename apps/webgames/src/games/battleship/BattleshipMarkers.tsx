import type { Shot } from '@gaming-platform/core';

import {
  CELL,
  CELL_RADIUS,
  HIT_FILL,
  HIT_GLOW,
  MINE_GLOW,
  MISS_DOT,
  MINE_COLOR,
} from './battleship-theme';

export type MarkerKind = 'miss' | 'hit' | 'sunk' | 'mine';

const GLOW_FILTER = 'url(#bs-glow)';

/** One shared blur filter: a per-element one at 100 markers is ruinous. */
export function MarkerDefs() {
  return (
    <defs>
      <filter id="bs-glow" x="-75%" y="-75%" width="250%" height="250%">
        <feGaussianBlur stdDeviation="3" />
      </filter>
      <linearGradient id="bs-cell" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="rgba(255,255,255,0.07)" />
        <stop offset="100%" stopColor="rgba(255,255,255,0.03)" />
      </linearGradient>
    </defs>
  );
}

/** An armed sea mine: two arms, two diagonal nubs, a core and a glow. */
export function MineMarker({
  row,
  col,
  exploded = false,
}: {
  row: number;
  col: number;
  exploded?: boolean;
}) {
  const cx = col * CELL + CELL / 2;
  const cy = row * CELL + CELL / 2;
  const arm = CELL * 0.3;
  const nub = CELL * 0.19 * Math.SQRT1_2;
  const core = CELL * 0.16;
  const stroke = CELL * 0.16;

  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={CELL * 0.32}
        fill={MINE_GLOW}
        filter={GLOW_FILTER}
      />
      <g stroke={MINE_COLOR} strokeWidth={stroke} strokeLinecap="round">
        <line x1={cx - arm} y1={cy} x2={cx + arm} y2={cy} />
        <line x1={cx} y1={cy - arm} x2={cx} y2={cy + arm} />
        <line x1={cx - nub} y1={cy - nub} x2={cx + nub} y2={cy + nub} />
        <line x1={cx - nub} y1={cy + nub} x2={cx + nub} y2={cy - nub} />
      </g>
      <circle cx={cx} cy={cy} r={core * 1.15} fill={MINE_COLOR} />
      {exploded && <circle cx={cx} cy={cy} r={core * 0.7} fill="var(--app)" />}
    </g>
  );
}

/**
 * A resolved shot. `sunk` is a hit whose ship went down, so it reads as a
 * solid block rather than a puncture.
 */
export function ShotMarker({
  shot,
  sunk,
}: {
  shot: Shot;
  sunk: boolean;
}) {
  const x = shot.col * CELL;
  const y = shot.row * CELL;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;

  if (shot.result === 'mine') {
    return <MineMarker row={shot.row} col={shot.col} exploded />;
  }

  if (shot.result === 'miss') {
    return <circle cx={cx} cy={cy} r={CELL * 0.18} fill={MISS_DOT} />;
  }

  if (sunk) {
    return (
      <g>
        <rect
          x={x + 3}
          y={y + 3}
          width={CELL - 6}
          height={CELL - 6}
          rx={CELL_RADIUS}
          fill={HIT_FILL}
        />
        <g
          stroke="#fff"
          strokeWidth={CELL * 0.09}
          strokeLinecap="round"
          opacity={0.9}
        >
          <line
            x1={cx - CELL * 0.16}
            y1={cy - CELL * 0.16}
            x2={cx + CELL * 0.16}
            y2={cy + CELL * 0.16}
          />
          <line
            x1={cx - CELL * 0.16}
            y1={cy + CELL * 0.16}
            x2={cx + CELL * 0.16}
            y2={cy - CELL * 0.16}
          />
        </g>
      </g>
    );
  }

  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={CELL * 0.3}
        fill={HIT_GLOW}
        filter={GLOW_FILTER}
      />
      <circle cx={cx} cy={cy} r={CELL * 0.22} fill={HIT_FILL} />
    </g>
  );
}
