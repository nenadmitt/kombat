/** The pawn silhouette from the design asset: shadow, flared body, collar,
 *  head with a specular dot. Drawn in its own 26x34 space and scaled to fit. */
const BODY = 'M5 16 Q13 20 21 16 L24 28.5 Q13 31.5 2 28.5 Z';
const COLLAR =
  'M8.6 14 L17.4 14 Q19 14 19 15.6 Q19 17.2 17.4 17.2 L8.6 17.2 Q7 17.2 7 15.6 Q7 14 8.6 14 Z';

export const PAWN_VIEW_W = 26;
export const PAWN_VIEW_H = 34;

const EDGE = 'rgba(0, 0, 0, 0.3)';

type Props = {
  /** Target width; the 26x34 artwork scales to it. */
  width: number;
  color: string;
  opacity?: number;
};

export function LudoPawn({ width, color, opacity }: Props) {
  const scale = width / PAWN_VIEW_W;
  return (
    <g transform={`scale(${scale})`} opacity={opacity}>
      <ellipse cx={13} cy={31} rx={8.5} ry={2.2} fill="rgba(0, 0, 0, 0.28)" />
      <path d={BODY} fill={color} stroke={EDGE} strokeWidth={1} />
      <path d={COLLAR} fill={color} stroke="rgba(0, 0, 0, 0.28)" strokeWidth={0.9} />
      <circle cx={13} cy={8.5} r={6.4} fill={color} stroke={EDGE} strokeWidth={1} />
      <circle cx={10.6} cy={6.4} r={2.1} fill="rgba(255, 255, 255, 0.5)" />
    </g>
  );
}
