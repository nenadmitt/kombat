import { ActivityIndicator, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import {
  STAKE_ASSET_SYMBOLS,
  formatStakeAmount,
} from '@gaming-platform/core';

import Icon from '../components/Icon';
import { Button, StakeFundingOverlay } from '../components/ui';
import { useGameStore } from '../store/game.store';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';
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
  const isSecuringStakes = useGameStore(state => state.isSecuringStakes);
  const minimize = useGameStore(state => state.minimize);
  const cancelWaitingRoom = useGameStore(state => state.cancelWaitingRoom);

  const visible = waitingRoom !== null && !isMinimized;
  const roomCode = waitingRoom ? formatRoomCode(waitingRoom.id) : '';

  const handleShare = () => {
    if (!waitingRoom) return;
    Share.share({
      message: `Join my KryptoKombat match - room #${roomCode}`,
    }).catch(() => {
      // User dismissed the share sheet; nothing to do.
    });
  };

  // Opponent joined a staked room: swap the whole popup for the playful
  // "getting your match ready" overlay (no on-chain wording) until it starts.
  if (isSecuringStakes) {
    const stakeSubtitle =
      waitingRoom && waitingRoom.stakeToken !== null && waitingRoom.stakeAmount
        ? `${formatStakeAmount(waitingRoom.stakeAmount, waitingRoom.stakeToken)} ${STAKE_ASSET_SYMBOLS[waitingRoom.stakeToken]} on the line`
        : undefined;
    return <StakeFundingOverlay visible subtitle={stakeSubtitle} />;
  }

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

          {/* Spinner ring */}
          <View style={styles.spinnerRing}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>

          {waitingRoom ? (
            <Text style={styles.gameLabel}>
              {GAME_TYPE_LABELS[waitingRoom.gameType].toUpperCase()}
            </Text>
          ) : null}

          <View style={styles.textStack}>
            <Text style={styles.title}>Waiting for players...</Text>
            <Text style={styles.description}>
              Share the room code with friends for others to join.
            </Text>
          </View>

          {waitingRoom ? (
            <View style={styles.roomCodeBox}>
              <Text style={styles.roomCodeLabel}>ROOM</Text>
              <Text style={styles.roomCodeText}>#{roomCode}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Button
              label="Share"
              icon="share"
              onPress={handleShare}
              style={styles.actionFlex}
            />
            <Button
              label={isCancelling ? 'Cancelling…' : 'Cancel'}
              variant="secondary"
              onPress={cancelWaitingRoom}
              disabled={isCancelling}
              style={styles.actionFlex}
            />
          </View>
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
  minimizeControl: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerRing: {
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
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
    marginTop: spacing.xs,
  },
  actionFlex: {
    flex: 1,
  },
});
