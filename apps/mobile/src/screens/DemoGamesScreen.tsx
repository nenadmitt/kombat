import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GameType } from '@gaming-platform/core';

import Icon, { type IconName } from '../components/Icon';
import { Card, Chip, Screen, SectionLabel } from '../components/ui';
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
  gameType: GameType;
};

/** Every card here is a real, playable game type - each launches its bot demo. */
const GAMES: GameCard[] = [
  { name: 'Battleships', tag: 'Strategy', players: '2.4k playing', icon: 'crosshair', tint: colors.accentSoft, gameType: GameType.NavalBattle },
  { name: 'Ludo Royale', tag: 'Board', players: '1.8k playing', icon: 'dice', tint: 'rgba(56,189,248,0.12)', gameType: GameType.Ludo },
  { name: 'Triple Cut', tag: 'Duel', players: '1.2k playing', icon: 'hand', tint: 'rgba(124,92,255,0.14)', gameType: GameType.TripleCut },
];

export default function DemoGamesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const playDemo = (game: GameCard) => {
    (navigation.navigate as (screen: string, params?: unknown) => void)(
      GAME_TYPE_DEMO_SCREENS[game.gameType],
    );
  };

  return (
    <Screen scroll>
      <Text style={styles.title}>Games</Text>

      {/* Demo mode banner (informational). */}
      <Card accent style={styles.demoCard}>
        <View style={styles.demoIcon}>
          <Icon type="target" color={colors.onAccent} size={20} />
        </View>
        <View style={styles.demoText}>
          <Text style={styles.demoTitle}>Demo Mode</Text>
          <Text style={styles.demoSubtitle}>
            Practice any game against a bot - free, no crypto staked.
          </Text>
        </View>
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
