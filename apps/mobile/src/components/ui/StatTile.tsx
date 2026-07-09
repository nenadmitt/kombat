import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../../theme/colors';
import { mono, type as typePresets } from '../../theme/typography';

type Props = {
  label: string;
  value: string;
  /** Value color — defaults to primary text. */
  valueColor?: string;
};

/** Small labelled metric tile (History stat grid, Profile mini-stats). */
export default function StatTile({ label, value, valueColor = colors.textPrimary }: Props) {
  return (
    <View style={styles.tile}>
      <Text style={[typePresets.label, styles.label]}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  label: {
    color: colors.textMuted,
  },
  value: {
    fontFamily: mono.bold,
    fontSize: 26,
    letterSpacing: -0.5,
  },
});
