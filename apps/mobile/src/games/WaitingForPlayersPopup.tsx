import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import Icon from '../components/Icon';
import { useGameStore } from '../store/game.store';
import { colors, radius, spacing } from '../theme/colors';
import { fonts } from '../theme/typography';
import { GAME_ICONS } from './game-icons';
import { GAME_TYPE_LABELS } from './game-type-labels';
import { formatRoomCode } from './room-code';

/**
 * Full "Waiting for Players" modal. Mounted once above the tab navigator
 * (see MainTabsWithGameOverlay) and driven entirely by game.store, so it
 * shows up regardless of which tab is active.
 */
export default function WaitingForPlayersPopup() {
  const waitingRoom = useGameStore(state => state.waitingRoom);
  const isMinimized = useGameStore(state => state.isMinimized);
  const isCancelling = useGameStore(state => state.isCancelling);
  const minimize = useGameStore(state => state.minimize);
  const cancelWaitingRoom = useGameStore(state => state.cancelWaitingRoom);

  const visible = waitingRoom !== null && !isMinimized;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={minimize}
    >
      <Pressable style={styles.overlay} onPress={minimize} />
      <View style={styles.container} pointerEvents="box-none">
        <View style={styles.card}>
          <Pressable
            onPress={minimize}
            style={styles.minimizeControl}
            accessibilityLabel="Minimize"
          >
            <Icon type="chevron-down" color={colors.textMuted} size={18} />
          </Pressable>

          {waitingRoom ? (
            <View style={styles.gameStack}>
              <Image
                source={GAME_ICONS[waitingRoom.gameType]}
                style={styles.gameIcon}
              />
              <Text style={styles.gameName}>
                {GAME_TYPE_LABELS[waitingRoom.gameType]}
              </Text>
            </View>
          ) : null}

          <View style={styles.textStack}>
            <Text style={styles.title}>Waiting for Players...</Text>
            <Text style={styles.description}>
              Your room has been created. Share the code with friends or wait
              for others to join.
            </Text>
          </View>

          {waitingRoom ? (
            <View style={styles.roomCodeBox}>
              <Text style={styles.roomCodeText}>
                <Text style={styles.roomCodeLabel}>ROOM: </Text>#
                {formatRoomCode(waitingRoom.id)}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={cancelWaitingRoom}
            disabled={isCancelling}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>
              {isCancelling ? 'Cancelling…' : 'Cancel'}
            </Text>
          </Pressable>
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
  minimizeControl: {
    position: 'absolute',
    top: 15,
    right: 15,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
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
  cancelButton: {
    width: '100%',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.chip,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.textMuted,
  },
});
