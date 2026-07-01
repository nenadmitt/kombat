import { useState } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Canvas, Fill, LinearGradient, vec } from '@shopify/react-native-skia';

type Point = { x: number; y: number };

type Props = {
  /** Gradient color stops. */
  colors: readonly string[];
  /** Optional stop positions (0..1), one per color. */
  positions?: readonly number[];
  /** Gradient start, in normalized (0..1) coordinates. Default top-left. */
  start?: Point;
  /** Gradient end, in normalized (0..1) coordinates. Default bottom-right. */
  end?: Point;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

/**
 * Fills its bounds with a linear gradient (via Skia) and renders children on top.
 * Set a borderRadius in `style` (with overflow handled here) to get rounded corners.
 */
export function GradientView({
  colors,
  positions,
  start = { x: 0, y: 0 },
  end = { x: 1, y: 1 },
  style,
  children,
}: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={[styles.clip, style]} onLayout={onLayout}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Fill>
          <LinearGradient
            start={vec(start.x * size.width, start.y * size.height)}
            end={vec(end.x * size.width, end.y * size.height)}
            colors={colors as string[]}
            positions={positions as number[] | undefined}
          />
        </Fill>
      </Canvas>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
});
