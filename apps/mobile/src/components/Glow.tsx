import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas, Fill, RadialGradient, vec } from '@shopify/react-native-skia';

type Props = {
  /** Diameter of the glow, in px. */
  size: number;
  /** Core color as a solid hex (`#8ee05a`); the edge fades to transparent. */
  color: string;
  /** Core alpha at the centre (0..1). Matches the design's color-mix percent. */
  opacity?: number;
  /** Fraction of the radius where the color reaches full transparency (0..1). */
  edge?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A soft radial-gradient glow blob (Skia). Non-interactive - absolutely
 * position it behind content via `style`. The recurring "accent bloom" the
 * redesign paints behind hero marks and in the corner of the featured card.
 */
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

/** `#rrggbb` + alpha 0..1 -> `rgba(...)`. Keeps the far stop the same hue so
 *  the fade doesn't drift toward grey. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
