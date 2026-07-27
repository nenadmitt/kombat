import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameType } from '@gaming-platform/core';

import Icon, { type IconName } from '../components/Icon';
import { colors, radius, spacing } from '../theme/colors';
import { display, type } from '../theme/typography';

export type GameChoice = {
  gameType: GameType;
  label: string;
  icon: IconName;
  blurb: string;
};

type Props = {
  visible: boolean;
  choices: readonly GameChoice[];
  selected: GameType;
  onSelect: (gameType: GameType) => void;
  onClose: () => void;
};

/**
 * Game picker rendered as an absolute overlay INSIDE the host modal rather
 * than its own Modal - stacking a second RN Modal over the create sheet
 * doesn't reliably present on iOS. No search field: the catalog is short and
 * the keyboard would cover the list.
 */
export default function GamePickerSheet({
  visible,
  choices,
  selected,
  onSelect,
  onClose,
}: Props) {
  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <SafeAreaView style={styles.wrapper} edges={['bottom']} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />
          <Text style={styles.title}>Select game</Text>

          <View style={styles.grid}>
            {choices.map(choice => {
              const isSelected = choice.gameType === selected;
              return (
                <Pressable
                  key={choice.gameType}
                  style={[styles.card, isSelected && styles.cardSelected]}
                  onPress={() => onSelect(choice.gameType)}
                >
                  <View style={styles.cardTop}>
                    <View style={styles.icon}>
                      <Icon type={choice.icon} color={colors.accentLight} size={22} />
                    </View>
                    {isSelected ? (
                      <Icon type="check" color={colors.accent} size={18} />
                    ) : null}
                  </View>
                  <View style={styles.cardText}>
                    <Text style={styles.name}>{choice.label}</Text>
                    <Text style={styles.blurb} numberOfLines={2}>
                      {choice.blurb}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6,6,9,0.7)',
  },
  wrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
  },
  title: {
    fontFamily: display.bold,
    fontSize: 22,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.sm,
  },
  card: {
    width: '48%',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.accent900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    gap: spacing.xxs,
  },
  name: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  blurb: {
    ...type.caption,
    color: colors.textMuted,
  },
});
