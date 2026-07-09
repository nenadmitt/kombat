import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Canvas, Fill, RadialGradient, vec } from '@shopify/react-native-skia';

import Icon, { type IconName } from './Icon';
import { GradientView } from './GradientView';
import { brandGradient, colors, goldGradient, radius, spacing } from '../theme/colors';
import { display, fonts, mono } from '../theme/typography';

export type ResultVariant = 'win' | 'lose';

export type ResultStat = {
  value: string;
  label: string;
  /** Render the value in the variant's accent color (e.g. hits, ships sunk). */
  highlight?: boolean;
};

export type ResultOpponent = {
  /** Single-letter avatar. */
  initial: string;
  /** e.g. "DEFEATED" / "LOST TO". */
  label: string;
  name: string;
};

type Props = {
  variant: ResultVariant;
  /** Hero glyph in the ring. */
  icon: IconName;
  /** Small uppercase kicker, e.g. "FLEET DESTROYED". */
  eyebrow: string;
  /** Big title, e.g. "VICTORY". */
  title: string;
  /** Supporting sentence under the title. */
  message: string;
  opponent?: ResultOpponent;
  /** Exactly four reads well in the 2x2 grid, but any count wraps. */
  stats: ResultStat[];
  /** Primary action — the "Back" button. */
  onBack: () => void;
  backLabel?: string;
  /** Optional secondary actions (rendered only when provided). */
  onHome?: () => void;
  onShare?: () => void;
};

type Theme = {
  accent: string;
  glow: [string, string];
  gradient: { colors: readonly string[]; positions: readonly number[] };
  /** Text/icon color that sits on the primary button gradient. */
  onGradient: string;
};

const THEME: Record<ResultVariant, Theme> = {
  win: {
    accent: colors.victoryGold,
    glow: ['rgba(245, 196, 81, 0.28)', 'rgba(245, 196, 81, 0)'],
    gradient: goldGradient,
    onGradient: colors.background,
  },
  lose: {
    accent: colors.defeatRed,
    glow: ['rgba(236, 91, 112, 0.22)', 'rgba(236, 91, 112, 0)'],
    gradient: brandGradient,
    onGradient: colors.textPrimary,
  },
};

/**
 * Generic end-of-match result screen (win or lose), reusable across games.
 * The calling game supplies the copy, opponent, stats and rank data; this
 * component owns the layout and the win/lose theming.
 */
export default function GameResultScreen({
  variant,
  icon,
  eyebrow,
  title,
  message,
  opponent,
  stats,
  onBack,
  backLabel = 'Back',
  onHome,
  onShare,
}: Props) {
  const { width } = useWindowDimensions();
  const theme = THEME[variant];

  return (
    <SafeAreaView style={styles.screen}>
      <Canvas style={styles.glow} pointerEvents="none">
        <Fill>
          <RadialGradient c={vec(width / 2, 130)} r={360} colors={theme.glow} />
        </Fill>
      </Canvas>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View
            style={[
              styles.iconRing,
              { borderColor: theme.accent, shadowColor: theme.accent },
            ]}
          >
            <Icon type={icon} color={theme.accent} size={40} />
          </View>

          <Text style={[styles.eyebrow, { color: theme.accent }]}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          {opponent && (
            <View style={styles.opponentRow}>
              <View style={[styles.opponentAvatar, { backgroundColor: theme.accent }]}>
                <Text style={styles.opponentInitial}>{opponent.initial}</Text>
              </View>
              <View>
                <Text style={styles.opponentLabel}>{opponent.label}</Text>
                <Text style={styles.opponentName}>{opponent.name}</Text>
              </View>
            </View>
          )}

          <View style={styles.statsGrid}>
            {stats.map((stat, i) => (
              <View key={i} style={styles.statCell}>
                <Text
                  style={[styles.statValue, stat.highlight && { color: theme.accent }]}
                >
                  {stat.value}
                </Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          <Pressable onPress={onBack} style={styles.primaryWrapper}>
            <GradientView
              colors={theme.gradient.colors}
              positions={theme.gradient.positions}
              style={styles.primaryButton}
            >
              <Icon type="chevron-left" color={theme.onGradient} size={18} />
              <Text style={[styles.primaryText, { color: theme.onGradient }]}>
                {backLabel}
              </Text>
            </GradientView>
          </Pressable>

          {(onHome || onShare) && (
            <View style={styles.secondaryRow}>
              {onHome && (
                <Pressable style={styles.secondaryButton} onPress={onHome}>
                  <Text style={styles.secondaryText}>Home</Text>
                </Pressable>
              )}
              {onShare && (
                <Pressable style={styles.secondaryButton} onPress={onShare}>
                  <Text style={styles.secondaryText}>Share</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 420,
    pointerEvents: 'none',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.md,
  },
  card: {
    alignItems: 'center',
    padding: spacing.md,
  },
  iconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    // Soft glow around the ring (iOS).
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
  },
  eyebrow: {
    fontSize: 12,
    fontFamily: mono.bold,
    letterSpacing: 3,
  },
  title: {
    fontSize: 44,
    fontFamily: display.extraBold,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    letterSpacing: -0.5,
  },
  message: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  opponentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
    backgroundColor: colors.cardBackground,
    borderRadius: radius.card,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  opponentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opponentInitial: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.background,
  },
  opponentLabel: {
    fontSize: 10,
    fontFamily: mono.medium,
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  opponentName: {
    fontSize: 15,
    fontFamily: display.semiBold,
    color: colors.textPrimary,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    alignSelf: 'stretch',
  },
  statCell: {
    width: '48.5%',
    flexGrow: 1,
    backgroundColor: colors.cardBackground,
    borderRadius: radius.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: 2,
  },
  statValue: {
    fontSize: 24,
    fontFamily: mono.bold,
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: mono.medium,
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  primaryWrapper: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 54,
    borderRadius: radius.button,
  },
  primaryText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    letterSpacing: 0.5,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBackground,
  },
  secondaryText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
});
