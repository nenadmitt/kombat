import { useMemo } from 'react';
import { Circle, Path, Skia } from '@shopify/react-native-skia';

type Props = {
  length: number;
  thickness: number;
  cells: number;
  color: string;
};

export default function ShipHull({ length, thickness, cells, color }: Props) {
  const hull = useMemo(() => {
    const h = thickness;
    const bow = h * 1.1;
    return (
      Skia.PathBuilder.Make()
        .moveTo(length - bow, 0)
        .lineTo(length, h / 2)
        .lineTo(length - bow, h)
        .lineTo(h / 2, h)
        .arcToOval(Skia.XYWHRect(0, 0, h, h), 90, 180, false)
        .close()
        .build()
    );
  }, [length, thickness]);

  const step = length / cells;

  return (
    <>
      <Path path={hull} color={color} />
      {Array.from({ length: cells - 1 }, (_, i) => (
        <Circle
          key={i}
          cx={step * (i + 1) - step / 4}
          cy={thickness / 2}
          r={thickness * 0.11}
          color="rgba(255, 255, 255, 0.45)"
        />
      ))}
    </>
  );
}
