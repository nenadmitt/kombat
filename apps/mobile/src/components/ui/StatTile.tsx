import { StyleSheet, Text, View } from 'react-native';

import Icon, { type IconName } from '../Icon';
import { colors, radius, spacing } from '../../theme/colors';
import { mono, type as typePresets } from '../../theme/typography';

type Props = {
  label: string;
  value: string;
  /** Value color - defaults to primary text. */
  valueColor?: string;
  /** Optional corner icon badge (History stat grid). */
  icon?: IconName;
  /** Tint for the icon badge (icon color + soft background). Defaults to muted. */
  iconTone?: string;
  /**
   * Optional 0..1 progress bar under the value. Fill uses `valueColor` when
   * set, otherwise the accent - the proportional bar in the redesign.
   */
  progress?: number;
  /** Accent-tinted tile (the highlighted "win rate" stat). */
  accent?: boolean;
};

/** Small labelled metric tile (History stat grid, Profile mini-stats). */
export default function StatTile({
  label,
  value,
  valueColor = colors.textPrimary,
  icon,
  iconTone = colors.textSecondary,
  progress,
  accent,
}: Props) {
  const barTone = accent ? colors.accentLight : valueColor;
  return (
    <View style={[styles.tile, accent && styles.tileAccent]}>
      <View style={styles.head}>
        <Text style={[typePresets.label, accent ? styles.labelAccent : styles.label]}>
          {label}
        </Text>
        {icon ? (
          <View
            style={[
              styles.badge,
              { backgroundColor: tintBg(accent ? colors.accent : iconTone) },
            ]}
          >
            <Icon type={icon} color={accent ? colors.accentLight : iconTone} size={14} />
          </View>
        ) : null}
      </View>
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

/** A soft, low-opacity wash of a tone for the icon badge background. */
function tintBg(tone: string) {
  if (tone === colors.textSecondary || tone === colors.textMuted) {
    return 'rgba(233, 233, 237, 0.08)';
  }
  return `${tone}22`;
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  tileAccent: {
    backgroundColor: colors.accent900,
    borderColor: 'transparent',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  label: {
    color: colors.textMuted,
  },
  labelAccent: {
    color: colors.accentLight,
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: mono.bold,
    fontSize: 30,
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
