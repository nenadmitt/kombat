import {
  BASE_CORNER,
  BOARD,
  HOME_COLUMN_CELLS,
  NEUTRAL_STAR_INDICES,
  SAFE_TRACK_INDICES,
  START_OFFSET,
  TOKENS_PER_PLAYER,
  TRACK_CELLS,
  cellForProgress,
  hasJump,
  hasShield,
  type LudoColor,
  type LudoJumps,
  type LudoShields,
  type LudoTokens,
} from '@gaming-platform/core';
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { LudoPawn, PAWN_VIEW_H, PAWN_VIEW_W } from './LudoPawn';
import { AbilityIcon, type AbilityId } from './LudoAbilityBar';
import { ABILITY_COLORS, LUDO_COLOR_HEX, ludoTint } from './ludo-theme';

const CELL = 10;
const SIZE = BOARD * CELL;
const GAP = CELL * 0.07;
const CELL_RADIUS = CELL * 0.2;

const NEUTRAL_FILL = 'rgba(255, 255, 255, 0.05)';
const NEUTRAL_BORDER = 'rgba(255, 255, 255, 0.6)';

// A bigger jump is a teleport and flies in one arc rather than crawling the track.
const MAX_WALK_STEPS = 12;

type CellPaint = {
  row: number;
  col: number;
  fill: string;
  border: string;
  star: string | null;
};

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

const ARM_CELLS: CellPaint[] = (() => {
  const cells: CellPaint[] = [];
  const homeColumn = new Map<string, LudoColor>();
  for (const color of Object.keys(HOME_COLUMN_CELLS) as LudoColor[]) {
    for (const cell of HOME_COLUMN_CELLS[color]) {
      homeColumn.set(`${cell.row},${cell.col}`, color);
    }
  }
  const trackColor = new Map<
    string,
    { color: LudoColor | null; star: boolean; goldStar: boolean }
  >();
  TRACK_CELLS.forEach((cell, idx) => {
    const start = (Object.entries(START_OFFSET) as [LudoColor, number][]).find(
      ([, offset]) => offset === idx,
    );
    trackColor.set(`${cell.row},${cell.col}`, {
      color: start ? start[0] : null,
      star: SAFE_TRACK_INDICES.has(idx),
      goldStar: NEUTRAL_STAR_INDICES.has(idx),
    });
  });

  const inMid = (v: number) => v >= 6 && v <= 8;
  for (let row = 0; row < BOARD; row++) {
    for (let col = 0; col < BOARD; col++) {
      const mr = inMid(row);
      const mc = inMid(col);
      if ((mr && mc) || (!mr && !mc)) {
        continue;
      }
      const key = `${row},${col}`;
      const color = homeColumn.get(key) ?? trackColor.get(key)?.color ?? null;
      const star = trackColor.get(key)?.star ?? false;
      const goldStar = trackColor.get(key)?.goldStar ?? false;
      cells.push({
        row,
        col,
        fill: color ? ludoTint(color, 0.2) : NEUTRAL_FILL,
        border: color
          ? LUDO_COLOR_HEX[color]
          : goldStar
            ? 'rgba(245, 184, 41, 0.55)'
            : NEUTRAL_BORDER,
        star: star ? (goldStar ? '#f5b829' : 'rgba(255, 255, 255, 0.9)') : null,
      });
    }
  }
  return cells;
})();

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
  seatedColors: LudoColor[];
  tokens: LudoTokens;
  eliminated?: LudoColor[];
  myColor?: LudoColor;
  movableTokens?: number[];
  onTokenPick?: (tokenIndex: number) => void;
  jumps?: LudoJumps;
  shields?: LudoShields;
};

const BOOSTED_TIP = 'Extra Jump - moves double';
const SHIELDED_TIP = 'Shield - cannot be captured';

function LudoBoardView({
  seatedColors,
  tokens,
  eliminated = [],
  myColor,
  movableTokens = [],
  onTokenPick,
  jumps = {},
  shields = {},
}: Props) {
  const prevProgressRef = useRef(new Map<string, number>());
  const [hovered, setHovered] = useState<string | null>(null);

  const anchors = useMemo(() => {
    const list: {
      color: LudoColor;
      tokenIndex: number;
      x: number;
      y: number;
      path: { x: number; y: number }[];
    }[] = [];
    const prevProgress = prevProgressRef.current;
    const nextProgress = new Map<string, number>();
    // My pawns paint last so a shared cell never hides the one I can click.
    const paintOrder =
      myColor && seatedColors.includes(myColor)
        ? [...seatedColors.filter(color => color !== myColor), myColor]
        : seatedColors;
    for (const color of paintOrder) {
      const progresses = tokens[color] ?? [];
      const byCell = new Map<string, number[]>();
      progresses.forEach((p, tokenIndex) => {
        const cell = cellForProgress(color, p);
        if (cell) {
          const key = `${cell.row},${cell.col}`;
          byCell.set(key, [...(byCell.get(key) ?? []), tokenIndex]);
        }
      });
      progresses.forEach((p, tokenIndex) => {
        nextProgress.set(`${color}-${tokenIndex}`, p);
        if (p === -1) {
          list.push({
            color,
            tokenIndex,
            ...baseSlotCenter(color, tokenIndex),
            path: [],
          });
          return;
        }
        const cell = cellForProgress(color, p);
        if (!cell) {
          return;
        }
        const from = prevProgress.get(`${color}-${tokenIndex}`);
        const path: { x: number; y: number }[] = [];
        if (
          from !== undefined &&
          from >= 0 &&
          from !== p &&
          Math.abs(p - from) <= MAX_WALK_STEPS
        ) {
          const dir = p > from ? 1 : -1;
          for (let q = from + dir; q !== p; q += dir) {
            const wc = cellForProgress(color, q);
            if (wc) {
              path.push({
                x: (wc.col + 0.5) * CELL,
                y: (wc.row + 0.5) * CELL,
              });
            }
          }
        }
        const stack = byCell.get(`${cell.row},${cell.col}`)!;
        const fan =
          stack.length > 1 ? stack.indexOf(tokenIndex) - (stack.length - 1) / 2 : 0;
        list.push({
          color,
          tokenIndex,
          x: (cell.col + 0.5) * CELL + fan * CELL * 0.38,
          y: (cell.row + 0.5) * CELL - Math.abs(fan) * CELL * 0.06,
          path,
        });
      });
    }
    prevProgressRef.current = nextProgress;
    return list;
  }, [seatedColors, tokens, myColor]);

  const movableSet = new Set(movableTokens);
  const pawnW = CELL;
  const pawnH = (pawnW / PAWN_VIEW_W) * PAWN_VIEW_H;

  const c0 = 6 * CELL;
  const c1 = 9 * CELL;
  const cm = 7.5 * CELL;

  const tip = (() => {
    const anchor = anchors.find(a => `${a.color}-${a.tokenIndex}` === hovered);
    if (!anchor) {
      return null;
    }
    const lines: { id: AbilityId; text: string }[] = [];
    if (hasJump(jumps, anchor.color, anchor.tokenIndex)) {
      lines.push({ id: 'jump', text: BOOSTED_TIP });
    }
    if (hasShield(shields, anchor.color, anchor.tokenIndex)) {
      lines.push({ id: 'shield', text: SHIELDED_TIP });
    }
    return lines.length > 0 ? { x: anchor.x, y: anchor.y, lines } : null;
  })();

  return (
    <div className="ludo-board-wrap">
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

        <path d={`M${c0},${c0}L${c1},${c0}L${cm},${cm}Z`} fill={LUDO_COLOR_HEX.green} />
        <path d={`M${c1},${c0}L${c1},${c1}L${cm},${cm}Z`} fill={LUDO_COLOR_HEX.yellow} />
        <path d={`M${c1},${c1}L${c0},${c1}L${cm},${cm}Z`} fill={LUDO_COLOR_HEX.blue} />
        <path d={`M${c0},${c1}L${c0},${c0}L${cm},${cm}Z`} fill={LUDO_COLOR_HEX.red} />
        <path d={starPath(cm, cm, CELL * 0.55)} fill="rgba(255, 255, 255, 0.92)" />

        {anchors.map(anchor => {
          const key = `${anchor.color}-${anchor.tokenIndex}`;
          const movable =
            anchor.color === myColor && movableSet.has(anchor.tokenIndex);
          const boosted = hasJump(jumps, anchor.color, anchor.tokenIndex);
          const shielded = hasShield(shields, anchor.color, anchor.tokenIndex);
          return (
            <HoppingPawn
              key={key}
              targetX={anchor.x - pawnW / 2}
              targetY={anchor.y - pawnH * 0.62}
              path={anchor.path.map(w => ({
                x: w.x - pawnW / 2,
                y: w.y - pawnH * 0.62,
              }))}
              className={movable ? 'ludo-pawn is-movable' : 'ludo-pawn'}
              onClick={movable ? () => onTokenPick?.(anchor.tokenIndex) : undefined}
              onHover={
                boosted || shielded
                  ? over => setHovered(over ? key : null)
                  : undefined
              }
            >
              {shielded && (
                <circle
                  className="ludo-pawn-shield"
                  cx={pawnW / 2}
                  cy={pawnH * 0.62}
                  r={CELL * 0.74}
                  fill="var(--shield)"
                  fillOpacity={0.16}
                  stroke="var(--shield)"
                  strokeWidth={CELL * 0.085}
                />
              )}
              {boosted && (
                <circle
                  className="ludo-pawn-boost"
                  cx={pawnW / 2}
                  cy={pawnH * 0.62}
                  r={CELL * 0.56}
                  fill="var(--gold-bright)"
                  fillOpacity={0.42}
                  stroke="var(--gold-bright)"
                  strokeWidth={CELL * 0.09}
                />
              )}
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
            </HoppingPawn>
          );
        })}
      </svg>

      {tip && (
        <span
          className="ludo-pawn-tip"
          style={{
            left: `${(tip.x / SIZE) * 100}%`,
            top: `${(tip.y / SIZE) * 100}%`,
          }}
        >
          {tip.lines.map(line => (
            <span key={line.id} className="ludo-pawn-tip-line">
              <span
                className="ludo-pawn-tip-icon"
                style={{ color: ABILITY_COLORS[line.id] }}
              >
                <AbilityIcon id={line.id} size={13} />
              </span>
              {line.text}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

const HOP_MS = 150;
const SINGLE_ARC_MS = 420;

// Driven imperatively so React re-renders never snap a pawn mid-flight.
function HoppingPawn({
  targetX,
  targetY,
  path,
  className,
  onClick,
  onHover,
  children,
}: {
  targetX: number;
  targetY: number;
  path: { x: number; y: number }[];
  className: string;
  onClick?: () => void;
  onHover?: (over: boolean) => void;
  children: ReactNode;
}) {
  const ref = useRef<SVGGElement>(null);
  const anim = useRef({
    xs: [targetX, targetX],
    ys: [targetY, targetY],
    progress: 1,
    raf: 0,
  });
  // Passed as a value: a fresh array each render would restart the effect and cancel a live hop.
  const pathRef = useRef(path);
  pathRef.current = path;
  const pathKey = path.map(w => `${w.x},${w.y}`).join(' ');

  useLayoutEffect(() => {
    ref.current?.setAttribute('transform', `translate(${targetX} ${targetY})`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => cancelAnimationFrame(anim.current.raf), []);

  useEffect(() => {
    const a = anim.current;
    const el = ref.current;
    if (
      !el ||
      (a.xs[a.xs.length - 1] === targetX && a.ys[a.ys.length - 1] === targetY)
    ) {
      return;
    }
    const waypoints = pathRef.current;

    const at = (p: number) => {
      const segs = a.xs.length - 1;
      const cp = Math.min(Math.max(p, 0), segs);
      const i = Math.min(Math.floor(cp), segs - 1);
      const t = cp - i;
      return {
        x: a.xs[i]! + (a.xs[i + 1]! - a.xs[i]!) * t,
        y: a.ys[i]! + (a.ys[i + 1]! - a.ys[i]!) * t,
        t,
      };
    };

    const start = at(a.progress);
    a.xs = [start.x, ...waypoints.map(w => w.x), targetX];
    a.ys = [start.y, ...waypoints.map(w => w.y), targetY];
    const segs = a.xs.length - 1;
    const hop = segs > 1 ? CELL * 0.35 : CELL * 0.6;
    const duration = segs > 1 ? segs * HOP_MS : SINGLE_ARC_MS;
    const t0 = performance.now();
    cancelAnimationFrame(a.raf);

    const frame = (now: number) => {
      const u = Math.min((now - t0) / duration, 1);
      const eased = segs > 1 ? u : 1 - (1 - u) * (1 - u);
      a.progress = eased * segs;
      const pos = at(a.progress);
      const lift = Math.sin(pos.t * Math.PI) * hop;
      el.setAttribute('transform', `translate(${pos.x} ${pos.y - lift})`);
      if (u < 1) {
        a.raf = requestAnimationFrame(frame);
      }
    };
    a.raf = requestAnimationFrame(frame);
  }, [targetX, targetY, pathKey]);

  return (
    <g
      ref={ref}
      className={className}
      onClick={onClick}
      onMouseEnter={onHover ? () => onHover(true) : undefined}
      onMouseLeave={onHover ? () => onHover(false) : undefined}
    >
      {children}
    </g>
  );
}

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
