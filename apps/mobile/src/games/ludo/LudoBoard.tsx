import { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Path,
  RoundedRect,
  Skia,
} from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
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

import LudoPawn, { pawnHeightFor } from './LudoPawn';
import { LUDO_COLOR_HEX, ludoTint } from './ludo-theme';

const NEUTRAL_FILL = 'rgba(255, 255, 255, 0.05)';
const NEUTRAL_BORDER = 'rgba(255, 255, 255, 0.6)';

type CellPaint = {
  row: number;
  col: number;
  fill: string;
  border: string;
  star: string | null;
};

function starPath(cx: number, cy: number, r: number) {
  const path = Skia.Path.Make();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    if (i === 0) {
      path.moveTo(x, y);
    } else {
      path.lineTo(x, y);
    }
  }
  path.close();
  return path;
}

function polygon(points: [number, number][]) {
  const path = Skia.Path.Make();
  points.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
  path.close();
  return path;
}

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
        continue;
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

type Props = {
  boardSize: number;
  seatedColors: LudoColor[];
  tokens: LudoTokens;
  eliminated?: LudoColor[];
  myColor?: LudoColor;
  movableTokens?: number[];
  onTokenTap?: (tokenIndex: number) => void;
};

function LudoBoard({
  boardSize,
  seatedColors,
  tokens,
  eliminated = [],
  myColor,
  movableTokens = [],
  onTokenTap,
}: Props) {
  const cell = boardSize / BOARD;
  const gap = Math.max(1.5, cell * 0.07);
  const cellRadius = cell * 0.2;

  const pulse = useSharedValue(0.35);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.95, { duration: 600 }),
        withTiming(0.35, { duration: 600 }),
      ),
      -1,
    );
  }, [pulse]);

  const prevProgressRef = useRef(new Map<string, number>());

  const tokenAnchors = useMemo(() => {
    const anchors: {
      color: LudoColor;
      tokenIndex: number;
      x: number;
      y: number;
      path: { x: number; y: number }[];
    }[] = [];
    const prevProgress = prevProgressRef.current;
    const nextProgress = new Map<string, number>();
    for (const color of seatedColors) {
      const list = tokens[color] ?? [];
      const byCell = new Map<string, number[]>();
      list.forEach((p, tokenIndex) => {
        const boardCell = cellForProgress(color, p);
        if (boardCell) {
          const key = `${boardCell.row},${boardCell.col}`;
          byCell.set(key, [...(byCell.get(key) ?? []), tokenIndex]);
        }
      });
      list.forEach((p, tokenIndex) => {
        nextProgress.set(`${color}-${tokenIndex}`, p);
        if (p === -1) {
          anchors.push({
            color,
            tokenIndex,
            ...baseSlotCenter(color, tokenIndex, cell),
            path: [],
          });
          return;
        }
        const boardCell = cellForProgress(color, p);
        if (!boardCell) {
          return;
        }
        const from = prevProgress.get(`${color}-${tokenIndex}`);
        const path: { x: number; y: number }[] = [];
        if (from !== undefined && from >= 0 && from !== p) {
          const dir = p > from ? 1 : -1;
          for (let q = from + dir; q !== p; q += dir) {
            const wc = cellForProgress(color, q);
            if (wc) {
              path.push({ x: (wc.col + 0.5) * cell, y: (wc.row + 0.5) * cell });
            }
          }
        }
        const stack = byCell.get(`${boardCell.row},${boardCell.col}`)!;
        const fan = stack.length > 1 ? stack.indexOf(tokenIndex) - (stack.length - 1) / 2 : 0;
        anchors.push({
          color,
          tokenIndex,
          x: (boardCell.col + 0.5) * cell + fan * cell * 0.38,
          y: (boardCell.row + 0.5) * cell - Math.abs(fan) * cell * 0.06,
          path,
        });
      });
    }
    prevProgressRef.current = nextProgress;
    return anchors;
  }, [seatedColors, tokens, cell]);

  const handleTouch = (locationX: number, locationY: number) => {
    if (!onTokenTap || !myColor) {
      return;
    }
    let best: { tokenIndex: number; d: number } | null = null;
    for (const anchor of tokenAnchors) {
      if (anchor.color !== myColor) {
        continue;
      }
      const d = Math.hypot(anchor.x - locationX, anchor.y - locationY);
      if (d < cell * 1.1 && (!best || d < best.d)) {
        best = { tokenIndex: anchor.tokenIndex, d };
      }
    }
    if (best) {
      onTokenTap(best.tokenIndex);
    }
  };

  const pawnW = cell * 1.0;
  const pawnH = pawnHeightFor(pawnW);
  const movableSet = new Set(movableTokens);

  const center = { x0: 6 * cell, y0: 6 * cell, size: 3 * cell };
  const c = {
    tl: [center.x0, center.y0] as [number, number],
    tr: [center.x0 + center.size, center.y0] as [number, number],
    br: [center.x0 + center.size, center.y0 + center.size] as [number, number],
    bl: [center.x0, center.y0 + center.size] as [number, number],
    mid: [center.x0 + center.size / 2, center.y0 + center.size / 2] as [number, number],
  };

  return (
    <View
      style={{ width: boardSize, height: boardSize }}
      onStartShouldSetResponder={() => true}
      onResponderRelease={e =>
        handleTouch(e.nativeEvent.locationX, e.nativeEvent.locationY)
      }
    >
      <Canvas style={StyleSheet.absoluteFill}>
        {ARM_CELLS.map(({ row, col, fill, border, star }) => {
          const x = col * cell + gap / 2;
          const y = row * cell + gap / 2;
          const size = cell - gap;
          return (
            <Group key={`${row},${col}`}>
              <RoundedRect x={x} y={y} width={size} height={size} r={cellRadius} color={fill} />
              <RoundedRect
                x={x}
                y={y}
                width={size}
                height={size}
                r={cellRadius}
                style="stroke"
                strokeWidth={1.5}
                color={border}
              />
              {star && (
                <Path
                  path={starPath(x + size / 2, y + size / 2, size * 0.28)}
                  color={star}
                />
              )}
            </Group>
          );
        })}

        {(Object.keys(BASE_CORNER) as LudoColor[]).map(color => (
          <BaseCorner
            key={color}
            color={color}
            cell={cell}
            seated={seatedColors.includes(color)}
            dimmed={eliminated.includes(color)}
          />
        ))}

        <Path path={polygon([c.tl, c.tr, c.mid])} color={LUDO_COLOR_HEX.green} />
        <Path path={polygon([c.tr, c.br, c.mid])} color={LUDO_COLOR_HEX.yellow} />
        <Path path={polygon([c.br, c.bl, c.mid])} color={LUDO_COLOR_HEX.blue} />
        <Path path={polygon([c.bl, c.tl, c.mid])} color={LUDO_COLOR_HEX.red} />
        <Path
          path={starPath(c.mid[0], c.mid[1], cell * 0.55)}
          color="rgba(255, 255, 255, 0.92)"
        />

        {tokenAnchors.map(anchor => (
          <AnimatedPawn
            key={`${anchor.color}-${anchor.tokenIndex}`}
            targetX={anchor.x - pawnW / 2}
            targetY={anchor.y - pawnH * 0.62}
            path={anchor.path.map(w => ({
              x: w.x - pawnW / 2,
              y: w.y - pawnH * 0.62,
            }))}
            width={pawnW}
            height={pawnH}
            hop={cell * 0.6}
            color={LUDO_COLOR_HEX[anchor.color]}
            dimmed={eliminated.includes(anchor.color)}
            highlighted={
              anchor.color === myColor && movableSet.has(anchor.tokenIndex)
            }
            pulse={pulse}
            glowRadius={cell * 0.62}
          />
        ))}
      </Canvas>
    </View>
  );
}

const HOP_MS = 150;

function AnimatedPawn({
  targetX,
  targetY,
  path,
  width,
  height,
  hop,
  color,
  dimmed,
  highlighted,
  pulse,
  glowRadius,
}: {
  targetX: number;
  targetY: number;
  path: { x: number; y: number }[];
  width: number;
  height: number;
  hop: number;
  color: string;
  dimmed: boolean;
  highlighted: boolean;
  pulse: SharedValue<number>;
  glowRadius: number;
}) {
  const xs = useSharedValue([targetX, targetX]);
  const ys = useSharedValue([targetY, targetY]);
  const progress = useSharedValue(1);

  useEffect(() => {
    const curXs = xs.value;
    const curYs = ys.value;
    if (
      curXs[curXs.length - 1] === targetX &&
      curYs[curYs.length - 1] === targetY
    ) {
      return;
    }
    const segs = curXs.length - 1;
    const p = Math.min(Math.max(progress.value, 0), segs);
    const i = Math.min(Math.floor(p), segs - 1);
    const t = p - i;
    const startX = curXs[i]! + (curXs[i + 1]! - curXs[i]!) * t;
    const startY = curYs[i]! + (curYs[i + 1]! - curYs[i]!) * t;
    const nextXs = [startX, ...path.map(w => w.x), targetX];
    const nextYs = [startY, ...path.map(w => w.y), targetY];
    xs.value = nextXs;
    ys.value = nextYs;
    const nextSegs = nextXs.length - 1;
    progress.value = 0;
    progress.value = withTiming(nextSegs, {
      duration: nextSegs > 1 ? nextSegs * HOP_MS : 420,
      easing: nextSegs > 1 ? Easing.linear : Easing.out(Easing.quad),
    });
  }, [targetX, targetY, path, xs, ys, progress]);

  const cx = width / 2;
  const cy = height * 0.62;
  const transform = useDerivedValue(() => {
    const px = xs.value;
    const py = ys.value;
    const segs = px.length - 1;
    const p = Math.min(Math.max(progress.value, 0), segs);
    const i = Math.min(Math.floor(p), segs - 1);
    const t = p - i;
    const x = px[i]! + (px[i + 1]! - px[i]!) * t;
    const hopHeight = segs > 1 ? hop * 0.55 : hop;
    const y = py[i]! + (py[i + 1]! - py[i]!) * t - Math.sin(t * Math.PI) * hopHeight;
    const scale = highlighted ? 1 + 0.18 * pulse.value : 1;
    return [
      { translateX: x + cx },
      { translateY: y + cy },
      { scale },
      { translateX: -cx },
      { translateY: -cy },
    ];
  });

  return (
    <Group transform={transform}>
      {highlighted && (
        <Circle
          cx={cx}
          cy={cy}
          r={glowRadius}
          color="rgba(255, 255, 255, 0.85)"
          opacity={pulse}
        >
          <BlurMask blur={7} style="normal" />
        </Circle>
      )}
      <LudoPawn
        x={0}
        y={0}
        width={width}
        color={color}
        opacity={dimmed ? 0.35 : 1}
      />
    </Group>
  );
}

function baseSlotCenter(
  color: LudoColor,
  tokenIndex: number,
  cell: number,
): { x: number; y: number } {
  const [rowStart, colStart] = BASE_CORNER[color];
  const size = 6 * cell;
  const x0 = colStart * cell;
  const y0 = rowStart * cell;
  const colIdx = tokenIndex % 2;
  const rowIdx = Math.floor(tokenIndex / 2);
  return {
    x: x0 + size * (0.31 + colIdx * 0.38),
    y: y0 + size * (0.31 + rowIdx * 0.38),
  };
}

function BaseCorner({
  color,
  cell,
  seated,
  dimmed,
}: {
  color: LudoColor;
  cell: number;
  seated: boolean;
  dimmed: boolean;
}) {
  const [rowStart, colStart] = BASE_CORNER[color];
  const inset = cell * 0.12;
  const x = colStart * cell + inset;
  const y = rowStart * cell + inset;
  const size = 6 * cell - inset * 2;
  const opacity = !seated ? 0.28 : dimmed ? 0.35 : 1;
  return (
    <Group opacity={opacity}>
      <RoundedRect x={x} y={y} width={size} height={size} r={cell * 0.75} color={ludoTint(color, 0.18)} />
      <RoundedRect
        x={x}
        y={y}
        width={size}
        height={size}
        r={cell * 0.75}
        style="stroke"
        strokeWidth={1.5}
        color={ludoTint(color, 0.85)}
      />
      <RoundedRect
        x={x + size * 0.09}
        y={y + size * 0.09}
        width={size * 0.82}
        height={size * 0.82}
        r={cell * 0.5}
        color="rgba(8, 6, 14, 0.4)"
      />
      {Array.from({ length: TOKENS_PER_PLAYER }, (_, i) => {
        const { x: cx, y: cy } = baseSlotCenter(color, i, cell);
        return (
          <Group key={i}>
            <Circle cx={cx} cy={cy} r={cell * 0.78} color={ludoTint(color, 0.14)} />
            <Circle
              cx={cx}
              cy={cy}
              r={cell * 0.78}
              style="stroke"
              strokeWidth={2}
              color={ludoTint(color, 0.7)}
            />
          </Group>
        );
      })}
    </Group>
  );
}

export default memo(LudoBoard);
