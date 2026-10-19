import { Canvas } from '@shopify/react-native-skia';

import ShipHull from './ShipHull';

type Props = {
  cells: number;
  color: string;
  cellPx?: number;
  thickness?: number;
};

export default function ShipGraphic({
  cells,
  color,
  cellPx = 12,
  thickness = 14,
}: Props) {
  const width = cells * cellPx;
  return (
    <Canvas style={{ width, height: thickness }}>
      <ShipHull length={width} thickness={thickness} cells={cells} color={color} />
    </Canvas>
  );
}
