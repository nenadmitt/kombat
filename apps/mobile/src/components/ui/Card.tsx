import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import Glow from '../Glow';
import { GradientView } from '../GradientView';
import { colors, radius, spacing } from '../../theme/colors';

type Point = { x: number; y: number };

export type CardGradient = {
  colors: readonly string[];
  positions?: readonly number[];
  start?: Point;
  end?: Point;
};

export type CardGlow = {
  color: string;
  size: number;
  opacity?: number;
  edge?: number;
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  accent?: boolean;
  flush?: boolean;
  gradient?: CardGradient;
  glow?: CardGlow;
  style?: StyleProp<ViewStyle>;
};

export default function Card({
  children,
  onPress,
  accent,
  flush,
  gradient,
  glow,
  style,
}: Props) {
  const layered = !!(gradient || glow);
  const content = [
    styles.base,
    accent && styles.accent,
    layered && styles.clip,
    gradient && styles.transparent,
    !flush && styles.padded,
    style,
  ];

  const inner = (
    <>
      {gradient ? (
        <GradientView
          colors={gradient.colors}
          positions={gradient.positions}
          start={gradient.start}
          end={gradient.end}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {glow ? (
        <Glow
          size={glow.size}
          color={glow.color}
          opacity={glow.opacity}
          edge={glow.edge}
          style={[
            styles.glow,
            {
              top: glow.top,
              right: glow.right,
              bottom: glow.bottom,
              left: glow.left,
            },
          ]}
        />
      ) : null}
      {children}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [content, pressed && styles.pressed]}
      >
        {inner}
      </Pressable>
    );
  }
  return <View style={content}>{inner}</View>;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
  },
  padded: {
    padding: spacing.md,
  },
  accent: {
    backgroundColor: colors.accent900,
    borderColor: colors.accentBorder,
  },
  clip: {
    overflow: 'hidden',
  },
  transparent: {
    backgroundColor: 'transparent',
  },
  glow: {
    position: 'absolute',
  },
  pressed: {
    opacity: 0.85,
  },
});
