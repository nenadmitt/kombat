import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GameType } from '@gaming-platform/core';

import { GradientView } from '../components/GradientView';
import Icon from '../components/Icon';
import { Screen } from '../components/ui';
import { GAME_TYPE_DEMO_SCREENS } from '../games/game-type-demo-screens';
import GameIcon from '../games/GameIcon';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';

type GameCard = {
  name: string;
  tag: string;
  length?: string;
  gameType: GameType;
  isNew?: boolean;
};

const HERO: GameCard = {
  name: 'Battleships',
  tag: 'Strategy',
  length: '10x10 grid · ~6 min',
  gameType: GameType.NavalBattle,
};

const PAIR: GameCard[] = [
  { name: 'Salvo', tag: 'Artillery', length: '~5 min', gameType: GameType.Salvo, isNew: true },
  { name: 'Ludo Royale', tag: 'Board', length: '~8 min', gameType: GameType.Ludo },
];

const ROWS: GameCard[] = [
  { name: 'Triple Cut', tag: 'Duel', length: '~2 min', gameType: GameType.TripleCut },
  { name: 'Chroma Clash', tag: 'Cards', length: '~4 min', gameType: GameType.ChromaClash },
];

const CARD_GRADIENT = [colors.accent900, colors.surfaceMuted] as const;
const CARD_START = { x: 1, y: 0 };
const CARD_END = { x: 0, y: 1 };

const metaOf = (game: GameCard) =>
  game.length ? `${game.tag} · ${game.length}` : game.tag;

const NewBadge = () => (
  <View style={styles.newBadge}>
    <Text style={styles.newBadgeText}>NEW</Text>
  </View>
);

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
      <View style={styles.header}>
        <Text style={styles.title}>Games</Text>
        <Text style={styles.subtitle}>Free practice against the bot</Text>
      </View>

      <Pressable
        onPress={() => playDemo(HERO)}
        accessibilityRole="button"
        accessibilityLabel={`Play ${HERO.name} demo`}
        style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
      >
        <GradientView
          colors={[colors.accent900, colors.surface]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.heroArt}
        >
          <View style={styles.heroIcon}>
            <GameIcon type={HERO.gameType} size={132} />
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.heroName}>{HERO.name}</Text>
            <Text style={styles.heroMeta}>{metaOf(HERO)}</Text>
          </View>
          <View style={styles.heroBtn}>
            <Icon type="play" color={colors.onAccent} size={13} />
            <Text style={styles.heroBtnText}>Demo</Text>
          </View>
        </GradientView>
      </Pressable>

      <View style={styles.pair}>
        {PAIR.map(game => (
          <Pressable
            key={game.name}
            onPress={() => playDemo(game)}
            accessibilityRole="button"
            accessibilityLabel={`Play ${game.name} demo`}
            style={({ pressed }) => [styles.pairCard, pressed && styles.pressed]}
          >
            <GradientView
              colors={CARD_GRADIENT}
              start={CARD_START}
              end={CARD_END}
              style={styles.pairFill}
            >
              <View style={styles.pairArt}>
                <GameIcon type={game.gameType} size={76} />
              </View>
              <View style={styles.pairBody}>
                <View style={styles.pairText}>
                  <View style={styles.titleLine}>
                    <Text style={styles.pairName}>{game.name}</Text>
                    {game.isNew ? <NewBadge /> : null}
                  </View>
                  <Text style={styles.meta}>{metaOf(game)}</Text>
                </View>
                <View style={styles.playBtn}>
                  <Icon type="play" color={colors.accent} size={13} />
                </View>
              </View>
            </GradientView>
          </Pressable>
        ))}
      </View>

      {ROWS.map(game => (
        <Pressable
          key={game.name}
          onPress={() => playDemo(game)}
          accessibilityRole="button"
          accessibilityLabel={`Play ${game.name} demo`}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <GradientView
            colors={CARD_GRADIENT}
            start={CARD_START}
            end={CARD_END}
            style={styles.rowFill}
          >
            <View style={styles.rowArt}>
              <GameIcon type={game.gameType} size={52} />
            </View>
            <View style={styles.rowBody}>
              <View style={styles.titleLine}>
                <Text style={styles.rowName}>{game.name}</Text>
                {game.isNew ? <NewBadge /> : null}
              </View>
              <Text style={styles.meta}>{metaOf(game)}</Text>
            </View>
            <View style={styles.playBtn}>
              <Icon type="play" color={colors.accent} size={13} />
            </View>
          </GradientView>
        </Pressable>
      ))}
    </Screen>
  );
}

const HERO_HEIGHT = 170;
const PAIR_HEIGHT = 142;
const ROW_HEIGHT = 84;
const PLAY_BTN = 32;

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
  },
  title: {
    ...type.title,
    color: colors.textPrimary,
  },
  subtitle: {
    ...type.caption,
    color: colors.textSecondary,
  },
  pressed: {
    opacity: 0.85,
  },
  hero: {
    height: HERO_HEIGHT,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  heroArt: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'flex-end',
  },
  heroIcon: {
    position: 'absolute',
    right: -spacing.xs,
    top: -spacing.xs,
    opacity: 0.5,
  },
  heroBody: {
    gap: spacing.xs,
  },
  heroName: {
    fontFamily: display.bold,
    fontSize: 26,
    letterSpacing: -0.6,
    color: colors.textPrimary,
  },
  heroMeta: {
    fontFamily: mono.regular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  heroBtn: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
  },
  heroBtnText: {
    fontFamily: display.bold,
    fontSize: 13,
    color: colors.onAccent,
  },
  pair: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pairCard: {
    flex: 1,
    height: PAIR_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  pairFill: {
    flex: 1,
  },
  pairArt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pairBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  pairText: {
    flex: 1,
    gap: spacing.xxs,
  },
  pairName: {
    fontFamily: display.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  row: {
    height: ROW_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  rowFill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  rowArt: {
    width: 62,
    alignItems: 'center',
  },
  rowBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowName: {
    fontFamily: display.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  meta: {
    fontFamily: mono.regular,
    fontSize: 10,
    color: colors.textMuted,
  },
  newBadge: {
    paddingHorizontal: spacing.xxs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
  },
  newBadgeText: {
    fontFamily: display.bold,
    fontSize: 9,
    letterSpacing: 0.8,
    color: colors.accent100,
  },
  playBtn: {
    width: PLAY_BTN,
    height: PLAY_BTN,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
