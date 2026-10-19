import type { Shot } from '@gaming-platform/core';
import { useEffect, useRef } from 'react';

import {
  CELL,
  CELL_RADIUS,
  HIT_FILL,
  HIT_GLOW,
  MINE_GLOW,
  MISS_DOT,
  MINE_COLOR,
  TORPEDO_COLOR,
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

export function ShotMarker({
  shot,
  sunk,
  enterIndex,
  stepMs = 0,
}: {
  shot: Shot;
  sunk: boolean;
  enterIndex?: number;
  stepMs?: number;
}) {
  const fx =
    enterIndex === undefined
      ? undefined
      : {
          className: 'bs-fx bs-enter',
          style: { animationDelay: `${enterIndex * stepMs}ms` },
        };
  const x = shot.col * CELL;
  const y = shot.row * CELL;
  const cx = x + CELL / 2;
  const cy = y + CELL / 2;

  if (shot.result === 'mine') {
    return (
      <g {...fx}>
        <MineMarker row={shot.row} col={shot.col} exploded />
      </g>
    );
  }

  if (shot.result === 'miss') {
    return (
      <g {...fx}>
        <circle cx={cx} cy={cy} r={CELL * 0.18} fill={MISS_DOT} />
      </g>
    );
  }

  if (sunk) {
    return (
      <g {...fx}>
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
    <g {...fx}>
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

export function MineExplosion({ row, col }: { row: number; col: number }) {
  const cx = col * CELL + CELL / 2;
  const cy = row * CELL + CELL / 2;
  return (
    <g className="bs-fx bs-blast">
      <circle cx={cx} cy={cy} r={CELL * 1.35} fill={MINE_GLOW} filter={GLOW_FILTER} />
      <circle
        cx={cx}
        cy={cy}
        r={CELL}
        fill="none"
        stroke={MINE_COLOR}
        strokeWidth={CELL * 0.12}
      />
    </g>
  );
}

export function BombBlast({ row, col }: { row: number; col: number }) {
  const cx = col * CELL + CELL / 2;
  const cy = row * CELL + CELL / 2;
  return (
    <g className="bs-fx bs-bomb">
      <circle cx={cx} cy={cy} r={CELL * 1.4} fill={MINE_GLOW} filter={GLOW_FILTER} />
    </g>
  );
}

export function TorpedoProjectile({
  row,
  fromCol,
  toCol,
  sweepMs,
}: {
  row: number;
  fromCol: number;
  toCol: number;
  sweepMs: number;
}) {
  const headRef = useRef<SVGGElement>(null);
  const y = row * CELL + CELL / 2;
  const startX = fromCol * CELL + CELL / 2;
  const endX = toCol * CELL + CELL / 2;

  useEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const animation = head.animate(
      [
        { transform: 'translateX(0px)' },
        { transform: `translateX(${endX - startX}px)` },
      ],
      { duration: sweepMs, easing: 'linear', fill: 'forwards' },
    );
    return () => animation.cancel();
  }, [startX, endX, sweepMs]);

  return (
    <g>
      <line
        className="bs-trail"
        x1={startX}
        y1={y}
        x2={endX}
        y2={y}
        stroke={TORPEDO_COLOR}
        strokeWidth={CELL * 0.12}
        strokeLinecap="round"
        opacity={0.7}
        style={{ ['--bs-sweep' as string]: `${sweepMs}ms` }}
      />
      <g ref={headRef}>
        <circle cx={startX} cy={y} r={CELL * 0.3} fill={MINE_GLOW} filter={GLOW_FILTER} />
        <circle cx={startX} cy={y} r={CELL * 0.16} fill={TORPEDO_COLOR} />
      </g>
    </g>
  );
}
