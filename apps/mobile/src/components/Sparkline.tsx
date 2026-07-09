import Svg, { Polyline } from 'react-native-svg';

type Props = {
  points: number[];
  color: string;
  width?: number;
  height?: number;
};

/** Tiny inline line chart (no axes) for asset rows / balance card. */
export default function Sparkline({ points, color, width = 64, height = 26 }: Props) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points
    .map((p, i) => {
      const x = i * step;
      const y = height - ((p - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={coords}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
