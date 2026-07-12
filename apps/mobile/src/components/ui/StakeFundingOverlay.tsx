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

type Props = {
  visible: boolean;
  /** Small line under the rotating message (e.g. the wager). Optional. */
  subtitle?: string;
};

/**
 * Full-screen "getting your match ready" overlay for staked games. Spins a
 * cheerful icon and rotates a random funny message. Reused by the lobby join
 * flow and the create/waiting popup.
 */
export default function StakeFundingOverlay({ visible, subtitle }: Props) {
  const [index, setIndex] = useState(0);
  const spin = useRef(new Animated.Value(0)).current;

  // Rotate the message while visible; reset to a fresh start each time it opens.
  useEffect(() => {
    if (!visible) {
      return;
    }
    setIndex(i => (i + 1) % MESSAGES.length);
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % MESSAGES.length);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, [visible]);

  // Continuous spin of the coin icon.
  useEffect(() => {
    if (!visible) {
      spin.setValue(0);
      return;
    }
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
  }, [visible, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Animated.View style={[styles.iconRing, { transform: [{ rotate }] }]}>
            <Icon type="dollar" color={colors.accent} size={34} />
          </Animated.View>
          <Text style={styles.title}>Setting up your match</Text>
          <Text style={styles.message}>{MESSAGES[index]}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
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
