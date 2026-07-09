import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GameType } from '@gaming-platform/core';

import Icon, { type IconName } from '../components/Icon';
import { Card, Chip, Screen, SectionLabel, Toggle } from '../components/ui';
import { GAME_TYPE_DEMO_SCREENS } from '../games/game-type-demo-screens';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';

type GameCard = {
  name: string;
  tag: string;
  players: string;
  icon: IconName;
  tint: string;
  /** Real catalog game types are playable; the rest are demo-only previews. */
  gameType?: GameType;
};

/**
 * Only Battleships (NavalBattle) is a real, playable game type — the others
 * are design-showcase previews and open a "coming soon" notice rather than
 * pretending to launch. The GameType catalog stays honest; these extra cards
 * live only in this screen to match the design's library grid.
 */
const GAMES: GameCard[] = [
  { name: 'Battleships', tag: 'Strategy', players: '2.4k playing', icon: 'crosshair', tint: colors.accentSoft, gameType: GameType.NavalBattle },
  { name: 'Ludo Classic', tag: 'Board', players: '1.8k playing', icon: 'grid', tint: 'rgba(56,189,248,0.12)' },
  { name: 'Yahtzee Arena', tag: 'Dice', players: '960 playing', icon: 'dice', tint: 'rgba(251,191,36,0.12)' },
  { name: 'Poker High', tag: 'Cards', players: '3.1k playing', icon: 'target', tint: 'rgba(36,224,138,0.12)' },
];

export default function DemoGamesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [demoMode, setDemoMode] = useState(true);

  const playDemo = (game: GameCard) => {
    if (game.gameType === undefined) {
      Alert.alert(game.name, 'This game is coming soon.');
      return;
    }
    (navigation.navigate as (screen: string, params?: unknown) => void)(
      GAME_TYPE_DEMO_SCREENS[game.gameType],
    );
  };

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
          {GAMES.map(game => (
            <Card key={game.name} flush style={styles.gameCard}>
              <View style={[styles.gameArt, { backgroundColor: game.tint }]}>
                <Chip label="Demo" tone="neutral" style={styles.demoBadge} />
                <Icon type={game.icon} color={colors.textPrimary} size={40} />
              </View>
              <View style={styles.gameBody}>
                <Text style={styles.gameName}>{game.name}</Text>
                <Text style={styles.gameMeta}>
                  {game.tag} · {game.players}
                </Text>
                <Pressable style={styles.playBtn} onPress={() => playDemo(game)}>
                  <Text style={styles.playBtnText}>Play Demo</Text>
                </Pressable>
              </View>
            </Card>
          ))}
        </View>

        <View style={styles.comingSoon}>
          <Icon type="lock" color={colors.textFaint} size={17} />
          <Text style={styles.comingText}>More games coming soon</Text>
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
    width: 40,
    height: 40,
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
    width: '47.8%',
    overflow: 'hidden',
  },
  gameArt: {
    height: 90,
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
    gap: 3,
  },
  gameName: {
    ...type.subheading,
    fontSize: 15,
    color: colors.textPrimary,
  },
  gameMeta: {
    fontFamily: mono.regular,
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  playBtn: {
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    paddingVertical: 9,
    alignItems: 'center',
  },
  playBtnText: {
    fontFamily: display.bold,
    fontSize: 13,
    color: colors.accent,
  },
  comingSoon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  comingText: {
    fontFamily: mono.medium,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textFaint,
    textTransform: 'uppercase',
  },
});
