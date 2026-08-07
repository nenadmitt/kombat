type Props = {
  /** Long dimension (bow to stern). */
  length: number;
  /** Short dimension. */
  thickness: number;
  /** Cell count - controls how many deck dots are drawn. */
  cells: number;
  color: string;
  opacity?: number;
};

/**
 * A ship hull pointing right: rounded stern, pointed bow, deck dots. Drawn at
 * the origin, so wrap it in a transform to position or rotate it.
 *
 * The stern is the mobile app's `arcToOval(0,0,h,h, start 90, sweep 180)`:
 * from the bottom of the cap, clockwise through the left edge, to the top.
 * In SVG's y-down space that is sweep-flag 1; flipping it puts the bulge on
 * the wrong end.
 */
export function ShipHull({ length, thickness, cells, color, opacity }: Props) {
  const h = thickness;
  const bow = h * 1.1;
  const r = h / 2;
  const path = [
    `M${length - bow},0`,
    `L${length},${r}`,
    `L${length - bow},${h}`,
    `L${r},${h}`,
    `A${r},${r} 0 0 1 ${r},0`,
    'Z',
  ].join(' ');

  const step = length / cells;

  return (
    <g opacity={opacity}>
      <path d={path} fill={color} fillRule="evenodd" />
      {Array.from({ length: cells - 1 }, (_, i) => (
        <circle
          key={i}
          cx={step * (i + 1) - step / 4}
          cy={h / 2}
          r={h * 0.11}
          fill="rgba(255, 255, 255, 0.45)"
        />
      ))}
    </g>
  );
}
