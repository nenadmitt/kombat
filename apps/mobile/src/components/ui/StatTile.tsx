import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../../theme/colors';
import { mono, type as typePresets } from '../../theme/typography';

type Props = {
  label: string;
  value: string;
  valueColor?: string;
  progress?: number;
  accent?: boolean;
};

export default function StatTile({
  label,
  value,
  valueColor = colors.textPrimary,
  progress,
  accent,
}: Props) {
  const barTone = accent ? colors.accentLight : valueColor;
  return (
    <View style={[styles.tile, accent && styles.tileAccent]}>
      <Text style={[typePresets.label, accent ? styles.labelAccent : styles.label]}>
        {label}
      </Text>
      <Text style={[styles.value, { color: accent ? colors.accentLight : valueColor }]}>
        {value}
      </Text>
      {progress != null ? (
        <View style={[styles.track, accent && styles.trackAccent]}>
          <View
            style={[
              styles.fill,
              {
                width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
                backgroundColor: barTone,
              },
            ]}
          />
        </View>
      ) : null}
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
    padding: spacing.sm,
    gap: spacing.xs,
  },
  tileAccent: {
    backgroundColor: colors.accent900,
    borderColor: 'transparent',
  },
  label: {
    color: colors.textMuted,
  },
  labelAccent: {
    color: colors.accentLight,
  },
  value: {
    fontFamily: mono.bold,
    fontSize: 22,
    letterSpacing: -0.5,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(233, 233, 237, 0.10)',
    overflow: 'hidden',
  },
  trackAccent: {
    backgroundColor: 'rgba(142, 224, 90, 0.22)',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
});
