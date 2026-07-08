import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GameType } from '@gaming-platform/core';

import { GAME_ICONS } from '../games/game-icons';
import { GAME_TYPE_DEMO_SCREENS } from '../games/game-type-demo-screens';
import { GAME_TYPE_LABELS } from '../games/game-type-labels';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme/colors';
import { fonts } from '../theme/typography';

/** Numeric enum values only — TS numeric enums also reverse-map name -> value. */
const ALL_GAME_TYPES = Object.values(GameType).filter(
  (value): value is GameType => typeof value === 'number',
);

/** Showcase of every game the platform supports — tap a tile to preview its UI. */
export default function DemoGamesScreen() {
  // Same pragmatic cast as GameLobyScreen — this screen's own nav type
  // doesn't know about root-level screens like BattleshipSetup.
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>Demo Games</Text>
        <Text style={styles.subtitle}>
          A look at every game on the platform.
        </Text>
        <View style={styles.grid}>
          {ALL_GAME_TYPES.map(gameType => (
            <Pressable
              key={gameType}
              style={styles.tile}
              onPress={() =>
                (
                  navigation.navigate as (
                    screen: string,
                    params?: unknown,
                  ) => void
                )(GAME_TYPE_DEMO_SCREENS[gameType])
              }
            >
              <Image source={GAME_ICONS[gameType]} style={styles.icon} />
              <Text style={styles.label}>{GAME_TYPE_LABELS[gameType]}</Text>
            </Pressable>
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
