import { BlurMask, Circle, Group, Line, RoundedRect, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

const HIT_FILL = 'rgba(239, 68, 68, 0.9)';
const HIT_GLOW = 'rgba(239, 68, 68, 0.55)';
const MISS_DOT = 'rgba(148, 163, 184, 0.7)';
const TORPEDO = '#facc15';
const CELL_RADIUS = 6;

export type MarkerKind = 'miss' | 'hit' | 'sunk';

type Geo = {
  cellX: number;
  cellY: number;
  cellSize: number;
  cx: number;
  cy: number;
};

type AnimatedShotProps = Geo & {
  kind: MarkerKind;
  /** Shared 0→1 timeline this marker reads. */
  progress: SharedValue<number>;
  /** Slice of the timeline this marker plays in (for staggered reveals). */
  windowStart: number;
  windowEnd: number;
};

/**
 * A single hit/miss/sunk marker whose entrance is driven by a shared timeline:
 * - miss: a grey X cross-fades into the settled grey dot.
 * - hit: an oversized glowing red circle springs back to normal size.
 * - sunk: the red square scales in, then the white X fades on top.
 * A settled marker is just this with `progress` pinned at 1.
 */
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

  // miss: dot scales up as the X fades out
  const missDotScale = useDerivedValue(() => [{ scale: t.value }]);
  const missXOpacity = useDerivedValue(() => 1 - t.value);
  // hit: circle springs from oversized down to base
  const hitScale = useDerivedValue(() => [{ scale: 1 + 0.9 * (1 - t.value) }]);
  // sunk: square forms first, then the X fades in
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

/** A big yellow blast flash over a bombed cell: a glowing circle that springs
 *  from oversized down to normal, then fades to reveal the settled marker. */
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

type TorpedoProjectileProps = {
  row: number;
  fromCol: number;
  toCol: number;
  cell: number;
  progress: SharedValue<number>;
};

/** A glowing yellow projectile sweeping left→right along a row, with a trail. */
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
