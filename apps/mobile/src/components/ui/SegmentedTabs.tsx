import { Pressable, StyleSheet, Text, View } from 'react-native';

import Icon, { type IconName } from '../Icon';
import { colors, radius, spacing } from '../../theme/colors';
import { body } from '../../theme/typography';

export type SegmentedTab<T extends string> = {
  value: T;
  label: string;
  icon?: IconName;
  /** Fill for this tab when selected. Defaults to the accent. */
  tint?: string;
};

type Props<T extends string> = {
  tabs: readonly SegmentedTab<T>[];
  value: T;
  onChange: (next: T) => void;
};

/**
 * Inset pill switcher for two or three peer views of one screen. The selected
 * tab paints its own tint, so a screen whose halves have different accents
 * (the lime wallet vs the gold stake pot) reads the accent before the label.
 */
export default function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
}: Props<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {tabs.map(tab => {
        const selected = tab.value === value;
        const tint = tab.tint ?? colors.accent;
        return (
          <Pressable
            key={tab.value}
            onPress={() => onChange(tab.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            style={({ pressed }) => [
              styles.tab,
              selected && [
                styles.selected,
                { backgroundColor: tint, shadowColor: tint },
              ],
              pressed && styles.pressed,
            ]}
          >
            {tab.icon ? (
              <Icon
                type={tab.icon}
                size={15}
                color={selected ? colors.onAccent : colors.textSecondary}
              />
            ) : null}
            <Text
              style={[
                styles.label,
                { color: selected ? colors.onAccent : colors.textSecondary },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    padding: spacing.xxs,
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  selected: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    fontFamily: body.bold,
    fontSize: 13,
    letterSpacing: 0.1,
  },
});
