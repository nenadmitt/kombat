type Props = {
  length: number;
  thickness: number;
  cells: number;
  color: string;
  opacity?: number;
};

// SVG sweep-flag 1 matches mobile's arcToOval stern; flipping it puts the bulge on the wrong end.
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
