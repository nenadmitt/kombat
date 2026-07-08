import { Pressable, StyleSheet, Text, View } from 'react-native';

import Icon from '../Icon';
import { colors, radius, spacing } from '../../theme/colors';
import { mono } from '../../theme/typography';

type Props = {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Formats the numeric value for display (e.g. two decimals). */
  format?: (v: number) => string;
};

/** −/+ numeric stepper (Create Room entry fee). Value is mono, + is accent. */
export default function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  format = v => v.toFixed(2),
}: Props) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease"
        onPress={() => onChange(clamp(value - step))}
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      >
        <Icon type="minus" color={colors.textPrimary} size={20} />
      </Pressable>

      <View style={styles.valueBox}>
        <Text style={styles.value}>{format(value)}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase"
        onPress={() => onChange(clamp(value + step))}
        style={({ pressed }) => [styles.btn, styles.btnAccent, pressed && styles.pressed]}
      >
        <Icon type="plus" color={colors.onAccent} size={20} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  btn: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  btnAccent: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pressed: {
    opacity: 0.8,
  },
  valueBox: {
    flex: 1,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  value: {
    fontFamily: mono.bold,
    fontSize: 22,
    letterSpacing: 1,
    color: colors.textPrimary,
  },
});
