import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas, Fill, RadialGradient, vec } from '@shopify/react-native-skia';

type Props = {
  size: number;
  color: string;
  opacity?: number;
  edge?: number;
  style?: StyleProp<ViewStyle>;
};

export default function Glow({ size, color, opacity = 0.35, edge = 0.7, style }: Props) {
  const r = size / 2;
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Fill>
          <RadialGradient
            c={vec(r, r)}
            r={r}
            colors={[withAlpha(color, opacity), withAlpha(color, 0)]}
            positions={[0, edge]}
          />
        </Fill>
      </Canvas>
    </View>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
