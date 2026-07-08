import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing } from '../../theme/colors';

type Props = {
  children: React.ReactNode;
  /** Renders as a pressable when provided. */
  onPress?: () => void;
  /** Accent-tinted variant (violet wash + border). */
  accent?: boolean;
  /** Removes inner padding (for cards with edge-to-edge rows/media). */
  flush?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Elevated surface with the standard hairline border and radius. */
export default function Card({ children, onPress, accent, flush, style }: Props) {
  const content = [
    styles.base,
    accent && styles.accent,
    !flush && styles.padded,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [content, pressed && styles.pressed]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={content}>{children}</View>;
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
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  pressed: {
    opacity: 0.85,
  },
});
