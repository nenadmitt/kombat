import { Circle, Group, Oval, Path, Skia } from '@shopify/react-native-skia';

const BODY = Skia.Path.MakeFromSVGString(
  'M5 16 Q13 20 21 16 L24 28.5 Q13 31.5 2 28.5 Z',
)!;
const COLLAR = Skia.Path.MakeFromSVGString(
  'M8.6 14 L17.4 14 Q19 14 19 15.6 Q19 17.2 17.4 17.2 L8.6 17.2 Q7 17.2 7 15.6 Q7 14 8.6 14 Z',
)!;

const VIEW_W = 26;
const VIEW_H = 34;

type Props = {
  x: number;
  y: number;
  width: number;
  color: string;
  opacity?: number;
};

export default function LudoPawn({ x, y, width, color, opacity }: Props) {
  const scale = width / VIEW_W;
  return (
    <Group
      transform={[{ translateX: x }, { translateY: y }, { scale }]}
      opacity={opacity}
    >
      <Oval
        x={13 - 8.5}
        y={31 - 2.2}
        width={17}
        height={4.4}
        color="rgba(0, 0, 0, 0.28)"
      />
      <Path path={BODY} color={color} />
      <Path path={BODY} style="stroke" strokeWidth={1} color="rgba(0, 0, 0, 0.3)" />
      <Path path={COLLAR} color={color} />
      <Path path={COLLAR} style="stroke" strokeWidth={0.9} color="rgba(0, 0, 0, 0.28)" />
      <Circle cx={13} cy={8.5} r={6.4} color={color} />
      <Circle cx={13} cy={8.5} r={6.4} style="stroke" strokeWidth={1} color="rgba(0, 0, 0, 0.3)" />
      <Circle cx={10.6} cy={6.4} r={2.1} color="rgba(255, 255, 255, 0.5)" />
    </Group>
  );
}

export function pawnHeightFor(width: number): number {
  return (width / VIEW_W) * VIEW_H;
}
