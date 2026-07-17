import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  GameType,
  LUDO_MIN_PLAYERS,
  STAKE_ASSET_SYMBOLS,
  formatStakeAmount,
} from '@gaming-platform/core';

import Icon from '../components/Icon';
import { Button, StakeFundingCard } from '../components/ui';
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
  const waitingJoinedCount = useGameStore(state => state.waitingJoinedCount);
  const waitingAsJoiner = useGameStore(state => state.waitingAsJoiner);
  const isMinimized = useGameStore(state => state.isMinimized);
  const isCancelling = useGameStore(state => state.isCancelling);
  const isStarting = useGameStore(state => state.isStarting);
  const isSecuringStakes = useGameStore(state => state.isSecuringStakes);
  const minimize = useGameStore(state => state.minimize);
  const cancelWaitingRoom = useGameStore(state => state.cancelWaitingRoom);
  const startWaitingRoom = useGameStore(state => state.startWaitingRoom);
  const [copied, setCopied] = useState(false);

  // Ludo rooms fill gradually: show the roster count, and give the CREATOR a
  // start-early action once enough players are in.
  const isLudo = waitingRoom?.gameType === GameType.Ludo;
  const canStartEarly =
    isLudo && !waitingAsJoiner && waitingJoinedCount >= LUDO_MIN_PLAYERS;

  // Securing is only this popup's business for the room CREATOR (they hold a
  // waitingRoom). The joiner's lobby screen presents its own funding overlay;
  // if we mounted a second Modal here at the same time, iOS wedges its modal
  // presentation stack and the whole app stops responding to touches.
  const showSecuring = isSecuringStakes && waitingRoom !== null;
  const visible = (waitingRoom !== null && !isMinimized) || showSecuring;
  // Prefer the real, shareable code; fall back to the derived one for any
  // legacy room that predates stored codes.
  const roomCode = waitingRoom
    ? waitingRoom.code ?? formatRoomCode(waitingRoom.id)
    : '';

  const handleCopy = () => {
    if (!roomCode) return;
    Clipboard.setString(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleShare = () => {
    if (!waitingRoom) return;
    Share.share({
      message: `Join my KryptoKombat match - room code ${roomCode}`,
    }).catch(() => {
      // User dismissed the share sheet; nothing to do.
    });
  };

  const stakeSubtitle =
    waitingRoom && waitingRoom.stakeToken !== null && waitingRoom.stakeAmount
      ? `${formatStakeAmount(waitingRoom.stakeAmount, waitingRoom.stakeToken)} ${STAKE_ASSET_SYMBOLS[waitingRoom.stakeToken]} on the line`
      : undefined;

  // ONE Modal for both faces of this popup. When the opponent joins a staked
  // room we swap the CONTENT to the playful "getting your match ready" card
  // (no on-chain wording) instead of mounting a different Modal - swapping or
  // stacking native Modals mid-flight wedges iOS's presentation stack.
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // No minimizing away while stakes are being locked in.
      onRequestClose={showSecuring ? () => {} : minimize}
    >
      {showSecuring ? (
        <>
          <View style={styles.overlay} />
          <View style={styles.container} pointerEvents="box-none">
            <StakeFundingCard subtitle={stakeSubtitle} />
          </View>
        </>
      ) : (
        <>
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
                  {waitingRoom?.isPrivate
                    ? 'Private room. Share the code so a friend can join.'
                    : 'Share the room code with friends for others to join.'}
                </Text>
              </View>

              {isLudo && waitingRoom ? (
                <View style={styles.rosterPill}>
                  <Icon type="users" color={colors.accentLight} size={14} />
                  <Text style={styles.rosterText}>
                    {waitingJoinedCount} / {waitingRoom.playerCount} joined
                  </Text>
                </View>
              ) : null}

              {waitingRoom ? (
                <Pressable
                  onPress={handleCopy}
                  accessibilityRole="button"
                  accessibilityLabel="Copy room code"
                  style={({ pressed }) => [
                    styles.roomCodeBox,
                    pressed && styles.roomCodePressed,
                  ]}
                >
                  <Text style={styles.roomCodeLabel}>CODE</Text>
                  <Text style={styles.roomCodeText}>{roomCode}</Text>
                  <Icon
                    type={copied ? 'check' : 'copy'}
                    color={copied ? colors.success : colors.accentLight}
                    size={15}
                  />
                </Pressable>
              ) : null}
              {copied ? <Text style={styles.copiedHint}>Copied to clipboard</Text> : null}

              {canStartEarly ? (
                <Button
                  label={
                    isStarting
                      ? 'Starting…'
                      : `Start with ${waitingJoinedCount} players`
                  }
                  disabled={isStarting || isCancelling}
                  onPress={() =>
                    startWaitingRoom().catch(() => {
                      // Room may have filled/closed meanwhile - the pushes
                      // (started / player events) reconcile the popup.
                    })
                  }
                  style={styles.startButton}
                />
              ) : null}

              <View style={styles.actions}>
                <Button
                  label="Share"
                  icon="share"
                  onPress={handleShare}
                  style={styles.actionFlex}
                />
                <Button
                  label={
                    isCancelling
                      ? waitingAsJoiner
                        ? 'Leaving…'
                        : 'Cancelling…'
                      : waitingAsJoiner
                        ? 'Leave'
                        : 'Cancel'
                  }
                  variant="secondary"
                  onPress={cancelWaitingRoom}
                  disabled={isCancelling || isStarting}
                  style={styles.actionFlex}
                />
              </View>
            </View>
          </View>
        </>
      )}
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
  roomCodePressed: {
    opacity: 0.7,
  },
  copiedHint: {
    ...type.caption,
    color: colors.success,
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
  rosterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  rosterText: {
    fontFamily: mono.bold,
    fontSize: 13,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  startButton: {
    width: '100%',
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
