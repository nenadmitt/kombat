import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import type { RpsMove } from '@gaming-platform/core';

/**
 * Hand glyphs for the three moves, matching the reference art
 * (prompts/rps_icons.png): filled hand silhouettes with a darker outline and
 * interior crease lines. Poses per the reference - `rock` = fist facing the
 * viewer with curled-finger segments, `paper` = straight-on open palm,
 * `scissors` = side-view hand with two fingers extended up-right.
 *
 * Each hand is capsule/circle primitives on a 64x64 grid, drawn twice: first
 * every primitive stroked wide, then every primitive filled on top - the
 * fill pass paints over interior stroke edges, leaving one clean union
 * outline. Interior detail strokes go on last.
 */

type Capsule = { t: 'cap'; x: number; y: number; w: number; h: number; rot?: number };
type Dot = { t: 'dot'; cx: number; cy: number; r: number };
type Part = Capsule | Dot;

type Hand = { parts: Part[]; lines: string[] };

const HANDS: Record<RpsMove, Hand> = {
  // Straight-on open palm, four fingers up, thumb out to the lower-left.
  paper: {
    parts: [
      { t: 'cap', x: 19, y: 11, w: 8, h: 26, rot: -7 },
      { t: 'cap', x: 28, y: 6, w: 8, h: 31 },
      { t: 'cap', x: 37, y: 8, w: 8, h: 29, rot: 6 },
      { t: 'cap', x: 45, y: 15, w: 8, h: 22, rot: 14 },
      { t: 'cap', x: 7, y: 30, w: 9, h: 19, rot: -38 },
      { t: 'cap', x: 17, y: 30, w: 36, h: 26 },
    ],
    lines: [],
  },
  // Fist facing the viewer: curled-finger segments + thumb folded across.
  rock: {
    parts: [
      { t: 'cap', x: 13, y: 19, w: 40, h: 30 },
      { t: 'dot', cx: 20, cy: 22, r: 7 },
      { t: 'dot', cx: 30, cy: 20, r: 7.5 },
      { t: 'dot', cx: 40, cy: 21, r: 7 },
      { t: 'cap', x: 16, y: 40, w: 30, h: 11 },
    ],
    lines: [
      'M23 24 q2 6 0.5 13',
      'M32 22 q2 7 0.5 15',
      'M41 23 q2 6 0.5 14',
      'M18 42 q12 6 26 3',
    ],
  },
  // Side view: two spread fingers extended up-right out of a folded fist.
  scissors: {
    parts: [
      { t: 'cap', x: 33, y: 4, w: 8, h: 32, rot: 20 },
      { t: 'cap', x: 42, y: 12, w: 8, h: 28, rot: 40 },
      { t: 'cap', x: 10, y: 30, w: 31, h: 22 },
      { t: 'dot', cx: 39, cy: 42, r: 7 },
      { t: 'cap', x: 12, y: 26, w: 16, h: 10, rot: -10 },
    ],
    lines: ['M30 42 q5 3 11 1'],
  },
};

const OUTLINE = 'rgba(0, 0, 0, 0.32)';
const OUTLINE_W = 3;

function Primitive({
  part,
  fill,
  outlined,
}: {
  part: Part;
  fill: string;
  outlined?: boolean;
}) {
  const strokeProps = outlined
    ? {
        stroke: OUTLINE,
        strokeWidth: OUTLINE_W * 2,
        strokeLinejoin: 'round' as const,
      }
    : {};
  if (part.t === 'dot') {
    return <Circle cx={part.cx} cy={part.cy} r={part.r} fill={fill} {...strokeProps} />;
  }
  const r = Math.min(part.w, part.h) / 2;
  const rect = (
    <Rect x={part.x} y={part.y} width={part.w} height={part.h} rx={r} ry={r} fill={fill} {...strokeProps} />
  );
  if (!part.rot) {
    return rect;
  }
  return (
    <G origin={`${part.x + part.w / 2}, ${part.y + part.h / 2}`} rotation={part.rot}>
      {rect}
    </G>
  );
}

type Props = {
  move: RpsMove;
  size?: number;
  color?: string;
};

export default function RpsIcon({ move, size = 46, color = '#fff' }: Props) {
  const { parts, lines } = HANDS[move];
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {parts.map((part, i) => (
        <Primitive key={`o${i}`} part={part} fill={color} outlined />
      ))}
      {parts.map((part, i) => (
        <Primitive key={`f${i}`} part={part} fill={color} />
      ))}
      {lines.map((d, i) => (
        <Path
          key={`l${i}`}
          d={d}
          fill="none"
          stroke={OUTLINE}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
}
