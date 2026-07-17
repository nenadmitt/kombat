import Svg, { Circle, G, Rect } from 'react-native-svg';
import type { RpsMove } from '@gaming-platform/core';

/**
 * Hand glyphs for the three moves, in the hand-drawn style of the reference
 * art: a filled hand with a darker outline. `rock` = fist, `paper` = open
 * hand, `scissors` = two fingers in a V over a fist.
 *
 * Each hand is a set of capsule (rounded-rect) and circle primitives on a
 * 64x64 grid. To get ONE clean union outline (not a seam between every
 * primitive) the whole set is drawn twice: first every primitive stroked
 * wide, then every primitive filled on top - the second pass paints over all
 * the interior stroke edges, leaving only the outer boundary outlined.
 */

type Capsule = { t: 'cap'; x: number; y: number; w: number; h: number; rot?: number };
type Dot = { t: 'dot'; cx: number; cy: number; r: number };
type Part = Capsule | Dot;

const HANDS: Record<RpsMove, Part[]> = {
  // Open hand: broad palm, four fanned fingers, thumb out to the side.
  paper: [
    { t: 'cap', x: 17, y: 8, w: 9, h: 30, rot: -9 },
    { t: 'cap', x: 27, y: 5, w: 9, h: 33 },
    { t: 'cap', x: 37, y: 7, w: 9, h: 31, rot: 8 },
    { t: 'cap', x: 46, y: 14, w: 9, h: 24, rot: 18 },
    { t: 'cap', x: 6, y: 28, w: 9, h: 20, rot: -34 }, // thumb
    { t: 'cap', x: 15, y: 30, w: 38, h: 26 }, // palm
  ],
  // Fist: rounded block with four knuckle bumps and a thumb across the front.
  rock: [
    { t: 'dot', cx: 22, cy: 30, r: 6 },
    { t: 'dot', cx: 31, cy: 28, r: 6.5 },
    { t: 'dot', cx: 40, cy: 29, r: 6.5 },
    { t: 'dot', cx: 48, cy: 31, r: 6 },
    { t: 'cap', x: 16, y: 30, w: 38, h: 24 }, // fist body
    { t: 'cap', x: 12, y: 38, w: 22, h: 10 }, // thumb across
  ],
  // Scissors: two spread fingers rising out of a fist.
  scissors: [
    { t: 'cap', x: 20, y: 4, w: 8.5, h: 34, rot: -20 }, // spread finger
    { t: 'cap', x: 34, y: 4, w: 8.5, h: 34, rot: 16 }, // spread finger
    { t: 'dot', cx: 45, cy: 33, r: 6 }, // curled knuckle
    { t: 'cap', x: 20, y: 32, w: 30, h: 22 }, // fist
    { t: 'cap', x: 12, y: 36, w: 18, h: 10, rot: 24 }, // thumb
  ],
};

const OUTLINE = 'rgba(0, 0, 0, 0.32)';
const OUTLINE_W = 3;

function Primitive({
  part,
  fill,
  stroke,
}: {
  part: Part;
  fill: string;
  stroke?: string;
}) {
  const strokeProps = stroke
    ? { stroke, strokeWidth: OUTLINE_W * 2, strokeLinejoin: 'round' as const }
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
  const parts = HANDS[move];
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {/* Pass 1: wide outline under everything. */}
      {parts.map((part, i) => (
        <Primitive key={`o${i}`} part={part} fill={color} stroke={OUTLINE} />
      ))}
      {/* Pass 2: fills paint over the interior seams. */}
      {parts.map((part, i) => (
        <Primitive key={`f${i}`} part={part} fill={color} />
      ))}
    </Svg>
  );
}
