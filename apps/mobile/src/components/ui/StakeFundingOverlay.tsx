import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';

import Icon from '../Icon';
import { colors, radius, spacing } from '../../theme/colors';
import { display, type } from '../../theme/typography';

/**
 * Playful lines shown while a staked match is being set up. Deliberately says
 * nothing about escrows, chains or transactions - just keeps the player smiling
 * for the couple of seconds it takes.
 */
const MESSAGES = [
  'Loading the cannons...',
  'Bribing the referee...',
  'Polishing your trophy early...',
  'Rounding up the crew...',
  'Reading the tea leaves...',
  'Warming up the sea monsters...',
  'Counting the loot...',
  'Sharpening the harpoons...',
];

const ROTATE_MS = 1800;

type CardProps = {
  /** Small line under the rotating message (e.g. the wager). Optional. */
  subtitle?: string;
};

/**
 * The "getting your match ready" card by itself (no Modal). Use this inside
 * an already-presented Modal (e.g. the waiting popup) - never present two
 * native Modals at once, iOS wedges its presentation stack and the app stops
 * receiving touches.
 */
export function StakeFundingCard({ subtitle }: CardProps) {
  const [index, setIndex] = useState(0);
  const spin = useRef(new Animated.Value(0)).current;

  // Rotate the message while mounted.
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % MESSAGES.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, []);

  // Continuous spin of the coin icon.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.card}>
      <Animated.View style={[styles.iconRing, { transform: [{ rotate }] }]}>
        <Icon type="dollar" color={colors.accent} size={34} />
      </Animated.View>
      <Text style={styles.title}>Setting up your match</Text>
      <Text style={styles.message}>{MESSAGES[index]}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

type Props = CardProps & {
  visible: boolean;
};

/**
 * Full-screen "getting your match ready" overlay for staked games, presented
 * as its own Modal. Only mount this where no other Modal can be up at the
 * same time (the lobby join flow); anywhere a Modal already exists, render
 * StakeFundingCard inside it instead.
 */
export default function StakeFundingOverlay({ visible, subtitle }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <StakeFundingCard subtitle={subtitle} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(6,6,9,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  iconRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: display.bold,
    fontSize: 22,
    letterSpacing: -0.3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    ...type.body,
    color: colors.accentLight,
    textAlign: 'center',
  },
  subtitle: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
