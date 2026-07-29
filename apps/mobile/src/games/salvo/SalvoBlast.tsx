import { BlurMask, Circle, Group } from '@shopify/react-native-skia';

import { colors } from '../../theme/colors';

/** Debris directions, in degrees anticlockwise from due right. Fixed so the
 *  hook count per blast never changes between renders. */
const SPARKS = [18, 55, 92, 128, 162, 205, 250, 300];

type Props = {
  /** Blast centre in screen space. */
  cx: number;
  cy: number;
  /** Radius the shockwave reaches at full expansion. */
  radius: number;
  /** 0 -> 1 over the life of the blast. */
  progress: number;
};

/**
 * A shell going off: a hot core that flashes and collapses, a shockwave ring
 * riding out past it, and debris thrown clear. Sized by `radius`, so the same
 * component covers a shell landing and a hull being destroyed.
 *
 * Driven by a plain number rather than a Reanimated shared value: `withTiming`
 * does not drive these Skia nodes in this app (a static assignment paints, an
 * animated one never does), while the JS-ticked progress the shell flight
 * already uses is smooth and predictable.
 */
export default function SalvoBlast({ cx, cy, radius, progress: p }: Props) {
  // The core punches out fast then dies back, leaving the ring to travel on.
  const coreR = radius * (p < 0.25 ? p * 2.4 : Math.max(0, 0.6 - (p - 0.25) * 0.8));
  const coreOpacity = Math.min(1, p * 8) * (1 - Math.min(1, p / 0.55));
  const glowR = coreR * 1.6;

  const ringR = radius * (0.25 + p * 1.15);
  const ringOpacity = Math.min(1, p * 6) * (1 - p);

  return (
    <Group>
      {coreOpacity > 0.01 && (
        <Group opacity={coreOpacity}>
          <Circle cx={cx} cy={cy} r={glowR} color={colors.gold}>
            <BlurMask blur={14} style="normal" />
          </Circle>
          <Circle cx={cx} cy={cy} r={coreR} color="#fff3c4" />
        </Group>
      )}

      {ringOpacity > 0.01 && (
        <Group opacity={ringOpacity}>
          <Circle
            cx={cx}
            cy={cy}
            r={ringR}
            style="stroke"
            strokeWidth={Math.max(1.4, radius * 0.05)}
            color={colors.gold}
          />
        </Group>
      )}

      {SPARKS.map(angle => (
        <Spark key={angle} cx={cx} cy={cy} radius={radius} angle={angle} progress={p} />
      ))}
    </Group>
  );
}

function Spark({
  cx,
  cy,
  radius,
  angle,
  progress: p,
}: {
  cx: number;
  cy: number;
  radius: number;
  angle: number;
  progress: number;
}) {
  const opacity = Math.min(1, p * 5) * (1 - p);
  if (opacity <= 0.01) {
    return null;
  }
  const rad = (angle * Math.PI) / 180;
  // Screen y grows downward, so a positive angle throws debris upward.
  const travel = radius * 1.3 * (1 - (1 - p) * (1 - p));
  // Debris decelerates as it flies and sags under gravity on the way out.
  const x = cx + Math.cos(rad) * travel;
  const y = cy - Math.sin(rad) * travel + radius * 0.9 * p * p;

  return (
    <Group opacity={opacity}>
      <Circle cx={x} cy={y} r={Math.max(0, radius * 0.09 * (1 - p))} color={colors.gold} />
    </Group>
  );
}
