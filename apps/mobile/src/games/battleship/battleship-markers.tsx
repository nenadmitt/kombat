import { BlurMask, Circle, Group, Line, RoundedRect, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { colors } from '../../theme/colors';

const HIT_FILL = 'rgba(255, 84, 104, 0.9)';
const HIT_GLOW = 'rgba(255, 84, 104, 0.55)';
const MISS_DOT = 'rgba(148, 163, 184, 0.7)';
const TORPEDO = '#f5b829';
const MINE_GLOW = 'rgba(251, 191, 36, 0.45)';
const CELL_RADIUS = 6;

export type MarkerKind = 'miss' | 'hit' | 'sunk' | 'mine';

type MineMarkerProps = {
  cx: number;
  cy: number;
  cellSize: number;
  opacity?: number;
  color?: string;
  exploded?: boolean;
};

export function MineMarker({
  cx,
  cy,
  cellSize,
  opacity,
  color,
  exploded = false,
}: MineMarkerProps) {
  const fill = color ?? TORPEDO;
  const core = cellSize * 0.16;
  const arm = cellSize * 0.3;
  const nub = cellSize * 0.19;
  const d = nub * Math.SQRT1_2;
  return (
    <Group opacity={opacity}>
      {!color && !exploded && (
        <Circle cx={cx} cy={cy} r={cellSize * 0.32} color={MINE_GLOW}>
          <BlurMask blur={6} style="normal" />
        </Circle>
      )}
      <Line p1={vec(cx - arm, cy)} p2={vec(cx + arm, cy)} color={fill} strokeWidth={core} strokeCap="round" />
      <Line p1={vec(cx, cy - arm)} p2={vec(cx, cy + arm)} color={fill} strokeWidth={core} strokeCap="round" />
      <Line p1={vec(cx - d, cy - d)} p2={vec(cx + d, cy + d)} color={fill} strokeWidth={core} strokeCap="round" />
      <Line p1={vec(cx - d, cy + d)} p2={vec(cx + d, cy - d)} color={fill} strokeWidth={core} strokeCap="round" />
      <Circle cx={cx} cy={cy} r={core * 1.15} color={fill} />
      {exploded && (
        <Circle cx={cx} cy={cy} r={core * 0.7} color={colors.background} />
      )}
    </Group>
  );
}

type Geo = {
  cellX: number;
  cellY: number;
  cellSize: number;
  cx: number;
  cy: number;
};

type AnimatedShotProps = Geo & {
  kind: MarkerKind;
  progress: SharedValue<number>;
  windowStart: number;
  windowEnd: number;
};

export function AnimatedShot({
  kind,
  cellX,
  cellY,
  cellSize,
  cx,
  cy,
  progress,
  windowStart,
  windowEnd,
}: AnimatedShotProps) {
  const span = Math.max(windowEnd - windowStart, 1e-4);
  const t = useDerivedValue(() => {
    'worklet';
    const raw = (progress.value - windowStart) / span;
    return Math.min(1, Math.max(0, raw));
  });

  const missDotScale = useDerivedValue(() => [{ scale: t.value }]);
  const missXOpacity = useDerivedValue(() => 1 - t.value);
  const hitScale = useDerivedValue(() => [{ scale: 1 + 0.9 * (1 - t.value) }]);
  const squareScale = useDerivedValue(() => [
    { scale: Math.min(1, t.value * 1.6) },
  ]);
  const xOpacity = useDerivedValue(() =>
    Math.min(1, Math.max(0, (t.value - 0.55) / 0.45)),
  );

  const origin = vec(cx, cy);
  const dotR = cellSize * 0.18;
  const xInset = cellSize * 0.28;

  if (kind === 'miss') {
    return (
      <Group>
        <Group origin={origin} transform={missDotScale}>
          <Circle cx={cx} cy={cy} r={dotR} color={MISS_DOT} />
        </Group>
        <Group opacity={missXOpacity}>
          <Line
            p1={vec(cellX + xInset, cellY + xInset)}
            p2={vec(cellX + cellSize - xInset, cellY + cellSize - xInset)}
            color={MISS_DOT}
            strokeWidth={2}
          />
          <Line
            p1={vec(cellX + cellSize - xInset, cellY + xInset)}
            p2={vec(cellX + xInset, cellY + cellSize - xInset)}
            color={MISS_DOT}
            strokeWidth={2}
          />
        </Group>
      </Group>
    );
  }

  if (kind === 'hit') {
    return (
      <Group origin={origin} transform={hitScale}>
        <Circle cx={cx} cy={cy} r={cellSize * 0.26} color={HIT_GLOW}>
          <BlurMask blur={5} style="normal" />
        </Circle>
        <Circle cx={cx} cy={cy} r={cellSize * 0.16} color={HIT_FILL} />
      </Group>
    );
  }

  if (kind === 'mine') {
    return (
      <Group origin={origin} transform={hitScale}>
        <MineMarker cx={cx} cy={cy} cellSize={cellSize} exploded />
      </Group>
    );
  }

  return (
    <Group>
      <Group origin={origin} transform={squareScale}>
        <RoundedRect
          x={cellX}
          y={cellY}
          width={cellSize}
          height={cellSize}
          r={CELL_RADIUS}
          color={HIT_FILL}
        />
      </Group>
      <Group opacity={xOpacity}>
        <Line
          p1={vec(cellX + xInset, cellY + xInset)}
          p2={vec(cellX + cellSize - xInset, cellY + cellSize - xInset)}
          color="white"
          strokeWidth={2}
        />
        <Line
          p1={vec(cellX + cellSize - xInset, cellY + xInset)}
          p2={vec(cellX + xInset, cellY + cellSize - xInset)}
          color="white"
          strokeWidth={2}
        />
      </Group>
    </Group>
  );
}

type BombBlastProps = {
  cx: number;
  cy: number;
  cellSize: number;
  progress: SharedValue<number>;
};

export function BombBlast({ cx, cy, cellSize, progress }: BombBlastProps) {
  const scale = useDerivedValue(() => [{ scale: 1.1 + 1.1 * (1 - progress.value) }]);
  const opacity = useDerivedValue(() => {
    const p = progress.value;
    const fadeOut = p > 0.65 ? 1 - (p - 0.65) / 0.35 : 1;
    return Math.min(1, p * 5) * fadeOut;
  });
  const origin = vec(cx, cy);

  return (
    <Group origin={origin} transform={scale} opacity={opacity}>
      <Circle cx={cx} cy={cy} r={cellSize * 0.55} color="rgba(250, 204, 21, 0.5)">
        <BlurMask blur={8} style="normal" />
      </Circle>
      <Circle cx={cx} cy={cy} r={cellSize * 0.34} color={TORPEDO} />
    </Group>
  );
}

type MineExplosionProps = {
  cx: number;
  cy: number;
  cellSize: number;
  progress: SharedValue<number>;
};

export function MineExplosion({ cx, cy, cellSize, progress }: MineExplosionProps) {
  const r = useDerivedValue(
    () => cellSize * (0.25 + 1.6 * progress.value),
  );
  const glowR = useDerivedValue(() => r.value * 1.35);
  const opacity = useDerivedValue(() => {
    const p = progress.value;
    const fadeOut = p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1;
    return Math.min(1, p * 6) * fadeOut;
  });

  return (
    <Group opacity={opacity}>
      <Circle cx={cx} cy={cy} r={glowR} color={MINE_GLOW}>
        <BlurMask blur={12} style="normal" />
      </Circle>
      <Circle cx={cx} cy={cy} r={r} color="rgba(250, 204, 21, 0.75)" />
    </Group>
  );
}

type TorpedoProjectileProps = {
  row: number;
  fromCol: number;
  toCol: number;
  cell: number;
  progress: SharedValue<number>;
};

export function TorpedoProjectile({
  row,
  fromCol,
  toCol,
  cell,
  progress,
}: TorpedoProjectileProps) {
  const startX = fromCol * cell;
  const endX = (toCol + 1) * cell;
  const cy = row * cell + cell / 2;

  const headX = useDerivedValue(() => startX + (endX - startX) * progress.value);
  const headVec = useDerivedValue(() => vec(headX.value, cy));

  return (
    <Group>
      <Line
        p1={vec(startX, cy)}
        p2={headVec}
        color={TORPEDO}
        strokeWidth={3}
      />
      <Circle cx={headX} cy={cy} r={cell * 0.34} color="rgba(250, 204, 21, 0.5)">
        <BlurMask blur={6} style="normal" />
      </Circle>
      <Circle cx={headX} cy={cy} r={cell * 0.18} color={TORPEDO} />
    </Group>
  );
}
