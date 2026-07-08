import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GameType } from '@gaming-platform/core';

import Icon, { type IconName } from '../components/Icon';
import { Button, Card, Chip, Screen, SectionLabel, Toggle } from '../components/ui';
import { GAME_TYPE_DEMO_SCREENS } from '../games/game-type-demo-screens';
import { GAME_TYPE_LABELS } from '../games/game-type-labels';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme/colors';
import { mono, type } from '../theme/typography';

/** Numeric enum values only — TS numeric enums also reverse-map name -> value. */
const ALL_GAME_TYPES = Object.values(GameType).filter(
  (value): value is GameType => typeof value === 'number',
);

/** Presentational metadata for the real catalog games (no invented titles). */
const GAME_META: Record<GameType, { genre: string; icon: IconName; tint: string }> = {
  [GameType.NavalBattle]: { genre: 'Strategy · 1v1', icon: 'crosshair', tint: colors.accent },
};

/** Showcase of every game the platform supports — tap to preview its UI. */
export default function DemoGamesScreen() {
  // Same pragmatic cast as GameLobyScreen — this screen's own nav type
  // doesn't know about root-level screens like BattleshipSetup.
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [demoMode, setDemoMode] = useState(true);

  return (
    <Screen scroll>
      <Text style={styles.title}>Games</Text>

      {/* Demo mode */}
      <Card accent style={styles.demoCard}>
        <View style={styles.demoIcon}>
          <Icon type="plus" color={colors.onAccent} size={20} />
        </View>
        <View style={styles.demoText}>
          <Text style={styles.demoTitle}>Demo Mode</Text>
          <Text style={styles.demoSubtitle}>
            Practice any game free — no crypto staked.
          </Text>
        </View>
        <Toggle value={demoMode} onValueChange={setDemoMode} />
      </Card>

      {/* All games */}
      <View style={styles.section}>
        <SectionLabel>All games</SectionLabel>
        <View style={styles.grid}>
          {ALL_GAME_TYPES.map(gameType => {
            const meta = GAME_META[gameType];
            return (
              <Card key={gameType} flush style={styles.gameCard}>
                <View style={[styles.gameArt, { backgroundColor: meta.tint + '22' }]}>
                  <Chip label="Demo" tone="neutral" style={styles.demoBadge} />
                  <Icon type={meta.icon} color={meta.tint} size={40} />
                </View>
                <View style={styles.gameBody}>
                  <Text style={styles.gameName}>{GAME_TYPE_LABELS[gameType]}</Text>
                  <Text style={styles.gameGenre}>{meta.genre}</Text>
                  <Button
                    label="Play Demo"
                    variant="tinted"
                    size="sm"
                    onPress={() =>
                      (
                        navigation.navigate as (
                          screen: string,
                          params?: unknown,
                        ) => void
                      )(GAME_TYPE_DEMO_SCREENS[gameType])
                    }
                  />
                </View>
              </Card>
            );
          })}

          {/* Coming-soon placeholder keeps the grid balanced without
              inventing playable titles. */}
          <View style={styles.comingCard}>
            <Icon type="lock" color={colors.textFaint} size={28} />
            <Text style={styles.comingText}>More games{'\n'}coming soon</Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...type.title,
    color: colors.textPrimary,
  },
  demoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  demoIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoText: {
    flex: 1,
    gap: 2,
  },
  demoTitle: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  demoSubtitle: {
    ...type.caption,
    color: colors.textSecondary,
  },
  section: {
    gap: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  gameCard: {
    width: '47.5%',
    overflow: 'hidden',
  },
  gameArt: {
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoBadge: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
  },
  gameBody: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  gameName: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  gameGenre: {
    fontFamily: mono.regular,
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  comingCard: {
    width: '47.5%',
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
  },
  comingText: {
    fontFamily: mono.medium,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.textFaint,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
