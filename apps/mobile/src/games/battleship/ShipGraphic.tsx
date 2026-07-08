import { Canvas } from '@shopify/react-native-skia';

import ShipHull from './ShipHull';

type Props = {
  cells: number;
  color: string;
  /** Length per cell in px — total silhouette length scales with the ship's size. */
  cellPx?: number;
  thickness?: number;
};

/** Standalone ship silhouette for regular RN layouts (tray cards, fleet
 *  panels). For drawing inside an existing Canvas, use ShipHull directly. */
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
