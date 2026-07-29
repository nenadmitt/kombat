import { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';

import Icon from '../../../components/Icon';
import { useConfirm } from '../../../components/ui';
import { colors, radius, spacing } from '../../../theme/colors';
import { display, mono } from '../../../theme/typography';
import TurnTimer from './TurnTimer';

type Props = {
  opponent: { initial: string; name: string };
  /** Epoch ms when fleet setup auto-forfeits (null hides the countdown). */
  deadline: number | null;
  /** Last sync/gateway failure - shown so a stuck wait is never mute. */
  error?: string | null;
  /** Confirmed cancel - forfeits the match. */
  onCancel: () => void;
};

// Accent tints derived from colors.accent (#8ee05a) - same precedent as the
// play screen's glow.
const BRAND_TINT_BG = 'rgba(142, 224, 90, 0.10)';
const BRAND_TINT_BORDER = 'rgba(142, 224, 90, 0.35)';
const BRAND_RING_BORDER = 'rgba(142, 224, 90, 0.55)';
const BRAND_SWEEP = colors.accentLight;
// Green tints derived from colors.success (#3ee08f).
const SUCCESS_TINT_BG = 'rgba(62, 224, 143, 0.08)';
const SUCCESS_TINT_BORDER = 'rgba(62, 224, 143, 0.28)';
// Red tints derived from colors.danger (#ff5a6e).
const DANGER_TINT_BG = 'rgba(255, 90, 110, 0.09)';
const DANGER_TINT_BORDER = 'rgba(255, 90, 110, 0.4)';

const RING_MS = 2600;
const SWEEP_MS = 2400;

/** One expanding sonar ring (scale up + fade out, looped). */
function SonarRing({ delay }: { delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: RING_MS, easing: Easing.out(Easing.ease) }),
        -1,
      ),
    );
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.8 + t.value * 0.75 }],
    opacity: 0.5 * (1 - t.value),
  }));
  return <Animated.View style={[styles.sonarRing, style]} />;
}

/** The radar dial: pulsing rings + rotating sweep arm + crosshair. */
function Radar() {
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: SWEEP_MS, easing: Easing.linear }),
      -1,
    );
  }, [rotation]);
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={styles.radarBox}>
      <SonarRing delay={0} />
      <SonarRing delay={RING_MS / 2} />
      <View style={styles.radarDial}>
        <Animated.View style={[StyleSheet.absoluteFill, sweepStyle]}>
          <Svg width={84} height={84} viewBox="0 0 84 84">
            <Defs>
              <SvgLinearGradient
                id="sweep"
                x1="42"
                y1="42"
                x2="42"
                y2="2"
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor={BRAND_SWEEP} stopOpacity="0.55" />
                <Stop offset="1" stopColor={BRAND_SWEEP} stopOpacity="0" />
              </SvgLinearGradient>
            </Defs>
            <Path d="M42 42 L42 4 A38 38 0 0 1 74 24 Z" fill="url(#sweep)" />
          </Svg>
        </Animated.View>
        <Icon type="crosshair" color={BRAND_SWEEP} size={34} />
      </View>
    </View>
  );
}

/**
 * Shown after a player submits their fleet, until the opponent is ready: a
 * modal-style card with a sonar radar, the shared auto-forfeit countdown
 * (server-enforced - see SETUP_SECONDS) and a cancel-with-confirm that
 * forfeits the match.
 */
export default function WaitingForOpponent({ opponent, deadline, error, onCancel }: Props) {
  const confirm = useConfirm();
  const confirmCancel = async () => {
    const ok = await confirm({
      title: 'Cancel match?',
      message: 'Cancelling forfeits the match and counts as a loss.',
      confirmLabel: 'Cancel match',
      cancelLabel: 'Keep waiting',
      icon: 'flag',
      destructive: true,
    });
    if (ok) {
      onCancel();
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <View style={styles.card}>
          <Radar />

          <Text style={styles.eyebrow}>FLEET DEPLOYED</Text>
          <Text style={styles.title}>
            Waiting for Opponent<Text style={styles.titleDots}>…</Text>
          </Text>
          <Text style={styles.description}>
            {opponent.name} is still deploying their fleet. The battle begins
            the moment they're ready.
          </Text>

          {/* Auto-forfeit countdown (server enforces the deadline). Loose
              check so an absent value (older server) hides it entirely. */}
          {deadline != null && (
            <View style={styles.timerPill}>
              <Icon type="timer" color={BRAND_SWEEP} size={18} />
              <Text style={styles.timerLabel}>AUTO-FORFEIT IN</Text>
              <TurnTimer deadline={deadline} style={styles.timerClock} />
            </View>
          )}

          {/* Ready status rows */}
          <View style={[styles.playerRow, styles.playerRowReady]}>
            <View style={[styles.avatar, styles.avatarYou]}>
              <Text style={styles.avatarTextDark}>Y</Text>
            </View>
            <View style={styles.playerText}>
              <Text style={styles.playerLabel}>YOU</Text>
              <Text style={styles.playerName}>Fleet ready</Text>
            </View>
            <View style={styles.statusGroup}>
              <View style={styles.readyBadge}>
                <Icon type="check" color={colors.background} size={12} strokeWidth={3.5} />
              </View>
              <Text style={styles.readyText}>READY</Text>
            </View>
          </View>

          <View style={styles.playerRow}>
            <View style={[styles.avatar, styles.avatarOpponent]}>
              <Text style={styles.avatarText}>{opponent.initial}</Text>
            </View>
            <View style={styles.playerText}>
              <Text style={styles.playerLabel}>OPPONENT</Text>
              <Text style={styles.playerName} numberOfLines={1}>
                {opponent.name}
              </Text>
            </View>
            <View style={styles.statusGroup}>
              <ActivityIndicator size="small" color={BRAND_SWEEP} />
              <Text style={styles.deployingText}>Deploying</Text>
            </View>
          </View>

          {/* A stuck wait must say why - a mute screen is undebuggable. */}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Cancel (forfeits the match) */}
          <Pressable style={styles.cancelButton} onPress={() => void confirmCancel()}>
            <Icon type="flag" color={colors.defeatRed} size={17} />
            <Text style={styles.cancelText}>CANCEL MATCH</Text>
          </Pressable>
          <Text style={styles.footnote}>
            Cancelling forfeits the match - it counts as a loss.
          </Text>
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
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  card: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: BRAND_TINT_BORDER,
    borderRadius: radius.hero,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  radarBox: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  sonarRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 52,
    borderWidth: 2,
    borderColor: colors.brandStart,
  },
  radarDial: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    borderColor: BRAND_RING_BORDER,
    backgroundColor: BRAND_TINT_BG,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: colors.brandStart,
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  eyebrow: {
    fontSize: 11,
    fontFamily: mono.bold,
    color: colors.accent,
    letterSpacing: 3,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 27,
    fontFamily: display.extraBold,
    color: colors.textPrimary,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  titleDots: {
    color: BRAND_SWEEP,
  },
  description: {
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 270,
    marginTop: spacing.xs + 4,
    marginBottom: spacing.md,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 4,
    alignSelf: 'stretch',
    backgroundColor: BRAND_TINT_BG,
    borderWidth: 1,
    borderColor: BRAND_TINT_BORDER,
    borderRadius: radius.chip,
    paddingVertical: 13,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  timerLabel: {
    fontSize: 9,
    fontFamily: mono.medium,
    color: colors.textMuted,
    letterSpacing: 1.5,
  },
  timerClock: {
    fontSize: 22,
    fontFamily: mono.bold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm - 4,
    alignSelf: 'stretch',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.chip,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: spacing.xs + 3,
  },
  playerRowReady: {
    backgroundColor: SUCCESS_TINT_BG,
    borderColor: SUCCESS_TINT_BORDER,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarYou: {
    backgroundColor: colors.success,
  },
  avatarOpponent: {
    backgroundColor: colors.brandStart,
  },
  avatarText: {
    fontSize: 15,
    fontFamily: display.bold,
    color: colors.textPrimary,
  },
  avatarTextDark: {
    fontSize: 15,
    fontFamily: display.bold,
    color: colors.background,
  },
  playerText: {
    flex: 1,
    minWidth: 0,
  },
  playerLabel: {
    fontSize: 9,
    fontFamily: mono.medium,
    color: colors.textMuted,
    letterSpacing: 1.4,
  },
  playerName: {
    fontSize: 14,
    fontFamily: display.semiBold,
    color: colors.textPrimary,
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  readyBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyText: {
    fontSize: 12,
    fontFamily: mono.semiBold,
    color: colors.success,
  },
  deployingText: {
    fontSize: 12,
    fontFamily: mono.semiBold,
    color: BRAND_SWEEP,
  },
  errorText: {
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
    textAlign: 'center',
    fontSize: 12,
    color: colors.textMuted,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 3,
    alignSelf: 'stretch',
    backgroundColor: DANGER_TINT_BG,
    borderWidth: 1,
    borderColor: DANGER_TINT_BORDER,
    borderRadius: radius.chip,
    paddingVertical: 15,
    marginTop: spacing.sm - 2,
  },
  cancelText: {
    fontSize: 14,
    fontFamily: mono.bold,
    color: colors.danger,
    letterSpacing: 0.7,
  },
  footnote: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.sm - 2,
    maxWidth: 280,
  },
});
