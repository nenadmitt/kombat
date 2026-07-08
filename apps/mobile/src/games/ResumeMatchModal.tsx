import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { GameRoomSummary } from '@gaming-platform/core';

import { GradientView } from '../components/GradientView';
import { brandGradient, colors, radius, spacing } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useGameStore } from '../store/game.store';
import { GAME_ICONS } from './game-icons';
import { GAME_TYPE_LABELS } from './game-type-labels';
import { formatRoomCode } from './room-code';

type Props = {
  /** Enter the match — navigation is owned by the mounting screen. */
  onRejoin: (room: GameRoomSummary) => void;
};

/**
 * Prompts the user to resume a match that was in progress when they last left
 * the app. Mounted once above the tab navigator (see MainTabsWithGameOverlay)
 * and driven entirely by game.store, so it shows regardless of the active tab.
 * Forfeiting hands the win to the opponent and ends the match server-side.
 */
export default function ResumeMatchModal({ onRejoin }: Props) {
  const resumableMatch = useGameStore(state => state.resumableMatch);
  const isForfeiting = useGameStore(state => state.isForfeiting);
  const forfeitResumableMatch = useGameStore(
    state => state.forfeitResumableMatch,
  );

  const visible = resumableMatch !== null;

  const confirmForfeit = () => {
    Alert.alert(
      'Forfeit match?',
      'You will lose this match and it cannot be resumed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forfeit',
          style: 'destructive',
          onPress: () => {
            void forfeitResumableMatch();
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay} />
      <View style={styles.container} pointerEvents="box-none">
        <View style={styles.card}>
          {resumableMatch ? (
            <>
              <View style={styles.gameStack}>
                <Image
                  source={GAME_ICONS[resumableMatch.gameType]}
                  style={styles.gameIcon}
                />
                <Text style={styles.gameName}>
                  {GAME_TYPE_LABELS[resumableMatch.gameType]}
                </Text>
              </View>

              <View style={styles.textStack}>
                <Text style={styles.title}>Match in progress</Text>
                <Text style={styles.description}>
                  You have a match waiting. Rejoin to keep playing, or forfeit
                  to give the win to your opponent.
                </Text>
              </View>

              <View style={styles.roomCodeBox}>
                <Text style={styles.roomCodeText}>
                  <Text style={styles.roomCodeLabel}>ROOM: </Text>#
                  {formatRoomCode(resumableMatch.id)}
                </Text>
              </View>

              <Pressable
                style={styles.rejoinButton}
                disabled={isForfeiting}
                onPress={() => onRejoin(resumableMatch)}
              >
                <GradientView
                  colors={brandGradient.colors}
                  positions={brandGradient.positions}
                  style={styles.rejoinGradient}
                >
                  <Text style={styles.rejoinText}>Rejoin match</Text>
                </GradientView>
              </Pressable>

              <Pressable
                onPress={confirmForfeit}
                disabled={isForfeiting}
                style={styles.forfeitButton}
              >
                <Text style={styles.forfeitText}>
                  {isForfeiting ? 'Forfeiting…' : 'Forfeit'}
                </Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.hero,
    paddingTop: spacing.xl - 8,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  gameStack: {
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  gameIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
  },
  gameName: {
    fontSize: 16,
    fontFamily: fonts.semiBold,
    color: colors.textMuted,
  },
  textStack: {
    alignItems: 'center',
    gap: spacing.xs + 6,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: 'center',
  },
  roomCodeBox: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.brandStart,
    borderRadius: radius.chip,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
  },
  roomCodeText: {
    fontSize: 18,
    fontFamily: fonts.extraBold,
    color: colors.textPrimary,
  },
  roomCodeLabel: {
    color: colors.brandStart,
  },
  rejoinButton: {
    width: '100%',
  },
  rejoinGradient: {
    width: '100%',
    borderRadius: radius.chip,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejoinText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  forfeitButton: {
    width: '100%',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.chip,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forfeitText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.danger,
  },
});
