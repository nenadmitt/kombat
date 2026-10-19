import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';
import type { GameRoomSummary } from '@gaming-platform/core';

import Icon from '../components/Icon';
import { Button } from '../components/ui';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';
import { useGameStore } from '../store/game.store';
import { GAME_TYPE_LABELS } from './game-type-labels';
import { formatRoomCode } from './room-code';

type Props = {
  onRejoin: (room: GameRoomSummary) => void;
};

/** The forfeit confirmation is a second face of this Modal: a second native Modal on top wedges iOS. */
type Face = 'resume' | 'confirm-forfeit';

export default function ResumeMatchModal({ onRejoin }: Props) {
  const resumableMatch = useGameStore(state => state.resumableMatch);
  const isForfeiting = useGameStore(state => state.isForfeiting);
  const forfeitResumableMatch = useGameStore(
    state => state.forfeitResumableMatch,
  );
  const clearResumableMatch = useGameStore(state => state.clearResumableMatch);

  const [face, setFace] = useState<Face>('resume');
  // Navigate from onDismiss: navigating while the Modal animates away overlaps two native transitions and wedges iOS touches.
  const pendingRejoinRef = useRef<GameRoomSummary | null>(null);

  const visible = resumableMatch !== null;

  useEffect(() => {
    if (visible) {
      setFace('resume');
    }
  }, [visible]);

  const handleRejoin = () => {
    if (!resumableMatch) {
      return;
    }
    if (Platform.OS !== 'ios') {
      // Android doesn't wedge and doesn't reliably fire Modal onDismiss.
      clearResumableMatch();
      onRejoin(resumableMatch);
      return;
    }
    pendingRejoinRef.current = resumableMatch;
    clearResumableMatch();
  };

  const handleDismissed = () => {
    const room = pendingRejoinRef.current;
    if (room) {
      pendingRejoinRef.current = null;
      onRejoin(room);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onDismiss={handleDismissed}
    >
      <View style={styles.overlay} />
      <View style={styles.container} pointerEvents="box-none">
        <View style={styles.card}>
          {resumableMatch && face === 'resume' ? (
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
                  #{resumableMatch.code ?? formatRoomCode(resumableMatch.id)}
                </Text>
              </View>

              <Button
                label="Rejoin match"
                disabled={isForfeiting}
                onPress={handleRejoin}
              />
              <Button
                label="Forfeit"
                variant="danger"
                disabled={isForfeiting}
                onPress={() => setFace('confirm-forfeit')}
              />
            </>
          ) : resumableMatch ? (
            <>
              <View style={[styles.iconRing, styles.iconRingDanger]}>
                <Icon type="flag" color={colors.danger} size={40} />
              </View>

              <View style={styles.textStack}>
                <Text style={styles.title}>Forfeit match?</Text>
                <Text style={styles.description}>
                  You will lose this match and it cannot be resumed.
                </Text>
              </View>

              <Button
                label={isForfeiting ? 'Forfeiting...' : 'Forfeit'}
                variant="danger"
                disabled={isForfeiting}
                onPress={() => void forfeitResumableMatch()}
              />
              <Button
                label="Keep playing"
                variant="secondary"
                disabled={isForfeiting}
                onPress={() => setFace('resume')}
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
  iconRingDanger: {
    borderColor: 'rgba(255, 84, 104, 0.4)',
    backgroundColor: 'rgba(255, 84, 104, 0.08)',
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
