import { Modal, StyleSheet, Text, View } from 'react-native';
import type { GameRoomSummary } from '@gaming-platform/core';

import Icon from '../components/Icon';
import { Button, useConfirm } from '../components/ui';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';
import { useGameStore } from '../store/game.store';
import { GAME_TYPE_LABELS } from './game-type-labels';
import { formatRoomCode } from './room-code';

type Props = {
  /** Enter the match - navigation is owned by the mounting screen. */
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
  const confirm = useConfirm();

  const visible = resumableMatch !== null;

  const confirmForfeit = async () => {
    const ok = await confirm({
      title: 'Forfeit match?',
      message: 'You will lose this match and it cannot be resumed.',
      confirmLabel: 'Forfeit',
      icon: 'flag',
      destructive: true,
    });
    if (ok) {
      void forfeitResumableMatch();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay} />
      <View style={styles.container} pointerEvents="box-none">
        <View style={styles.card}>
          {resumableMatch ? (
            <>
              <View style={styles.iconRing}>
                <Icon type="swords" color={colors.accent} size={40} />
              </View>

              <Text style={styles.gameLabel}>
                {GAME_TYPE_LABELS[resumableMatch.gameType].toUpperCase()}
              </Text>

              <View style={styles.textStack}>
                <Text style={styles.title}>Match in progress</Text>
                <Text style={styles.description}>
                  Rejoin to keep playing, or forfeit to give the win to your
                  opponent.
                </Text>
              </View>

              <View style={styles.roomCodeBox}>
                <Text style={styles.roomCodeLabel}>ROOM</Text>
                <Text style={styles.roomCodeText}>
                  #{formatRoomCode(resumableMatch.id)}
                </Text>
              </View>

              <Button
                label="Rejoin match"
                disabled={isForfeiting}
                onPress={() => onRejoin(resumableMatch)}
              />
              <Button
                label={isForfeiting ? 'Forfeiting...' : 'Forfeit'}
                variant="danger"
                disabled={isForfeiting}
                onPress={() => void confirmForfeit()}
              />
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  iconRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameLabel: {
    fontFamily: mono.semiBold,
    fontSize: 12,
    letterSpacing: 3,
    color: colors.accent,
  },
  textStack: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    fontFamily: display.bold,
    fontSize: 24,
    letterSpacing: -0.3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  description: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  roomCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.accentBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  roomCodeLabel: {
    fontFamily: mono.semiBold,
    fontSize: 13,
    letterSpacing: 2,
    color: colors.accentLight,
  },
  roomCodeText: {
    fontFamily: mono.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
});
