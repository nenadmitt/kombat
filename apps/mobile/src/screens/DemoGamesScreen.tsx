import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GameType } from '@gaming-platform/core';

import { GAME_ICONS } from '../games/game-icons';
import { GAME_TYPE_LABELS } from '../games/game-type-labels';
import { colors, radius, spacing } from '../theme/colors';
import { fonts } from '../theme/typography';

/** Numeric enum values only — TS numeric enums also reverse-map name -> value. */
const ALL_GAME_TYPES = Object.values(GameType).filter(
  (value): value is GameType => typeof value === 'number',
);

/** Showcase of every game the platform supports. Not wired up yet — browsing only. */
export default function DemoGamesScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>Demo Games</Text>
        <Text style={styles.subtitle}>
          A look at every game on the platform.
        </Text>
        <View style={styles.grid}>
          {ALL_GAME_TYPES.map(gameType => (
            <View key={gameType} style={styles.tile}>
              <Image source={GAME_ICONS[gameType]} style={styles.icon} />
              <Text style={styles.label}>{GAME_TYPE_LABELS[gameType]}</Text>
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: {
    fontSize: 28,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    width: 100,
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    paddingVertical: spacing.sm,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.chip,
  },
  label: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
});
