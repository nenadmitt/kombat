import Svg, { G, Rect } from 'react-native-svg';
import type { RpsMove } from '@gaming-platform/core';

/**
 * Hand glyphs for the three moves. Built from rounded finger + palm bars in a
 * single fill (no internal seams), ported from the Triple Cut design's own
 * hand shapes: `rock` = fist, `paper` = open hand, `scissors` = two fingers
 * in a V. Authored on a 64x64 grid; `color` tints the whole hand.
 */

type Bar = { x: number; y: number; w: number; h: number; rot?: number };

const HANDS: Record<RpsMove, { rot: number; bars: Bar[] }> = {
  rock: {
    rot: -8,
    bars: [
      { x: 16, y: 26, w: 9, h: 15, rot: 0 },
      { x: 25, y: 23, w: 9, h: 18 },
      { x: 34, y: 24, w: 9, h: 17 },
      { x: 43, y: 27, w: 8.5, h: 14 },
      { x: 15, y: 33, w: 38, h: 21 }, // palm/fist
      { x: 5, y: 35, w: 8, h: 15, rot: 34 }, // thumb
    ],
  },
  paper: {
    rot: -6,
    bars: [
      { x: 17, y: 14, w: 7.5, h: 27 },
      { x: 26, y: 9, w: 7.5, h: 32 },
      { x: 35, y: 11, w: 7.5, h: 30 },
      { x: 44, y: 17, w: 7.5, h: 24 },
      { x: 15, y: 33, w: 39, h: 20 }, // palm
      { x: 4, y: 30, w: 7.5, h: 18, rot: -32 }, // thumb
    ],
  },
  scissors: {
    rot: -4,
    bars: [
      { x: 24, y: 6, w: 7.5, h: 32, rot: -19 }, // spread finger
      { x: 33, y: 6, w: 7.5, h: 32, rot: 13 }, // spread finger
      { x: 40, y: 30, w: 8.5, h: 10 }, // curled nub
      { x: 20, y: 33, w: 30, h: 20 }, // fist
      { x: 12, y: 34, w: 7.5, h: 14, rot: 32 }, // thumb
    ],
  },
};

type Props = {
  move: RpsMove;
  size?: number;
  color?: string;
};

export default function RpsIcon({ move, size = 46, color = '#fff' }: Props) {
  const { rot, bars } = HANDS[move];
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <G origin="32, 34" rotation={rot}>
        {bars.map((b, i) => {
          const r = Math.min(b.w, b.h) / 2;
          const rect = (
            <Rect x={b.x} y={b.y} width={b.w} height={b.h} rx={r} ry={r} fill={color} />
          );
          if (!b.rot) {
            return <G key={i}>{rect}</G>;
          }
          return (
            <G key={i} origin={`${b.x + b.w / 2}, ${b.y + b.h / 2}`} rotation={b.rot}>
              {rect}
            </G>
          );
        })}
      </G>
    </Svg>
  );
}
