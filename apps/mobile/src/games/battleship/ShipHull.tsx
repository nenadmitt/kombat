import { useMemo } from 'react';
import { Circle, Path, Skia } from '@shopify/react-native-skia';

type Props = {
  /** Long dimension in px (bow to stern). */
  length: number;
  /** Short dimension in px. */
  thickness: number;
  /** Cell count - controls how many deck dots are drawn. */
  cells: number;
  color: string;
};

/** Skia subtree (no Canvas of its own) drawing a ship hull pointing right:
 *  rounded stern, pointed bow, deck dots. Drawn at origin (0,0) - wrap in a
 *  Group transform to position/rotate it. Shared by the tray cards and the
 *  board (hover preview + placed ships). */
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
        // Rounded stern: half-circle cap on the left end.
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
