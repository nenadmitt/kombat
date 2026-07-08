import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, GameType } from '@gaming-platform/core';

import { apiClient } from '../api/client';
import Icon from '../components/Icon';
import { Button } from '../components/ui';
import { useGameStore } from '../store/game.store';
import { colors, radius, spacing } from '../theme/colors';
import { display, type } from '../theme/typography';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Bottom-sheet modal for creating a game room. Only asks for the game type —
 * Betting Asset / Entry Fee / Private Room from the design aren't backed by
 * anything server-side yet, so they're left out rather than shipping controls
 * that don't do anything.
 */
export default function CreateGameRoomModal({ visible, onClose }: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setWaitingRoom = useGameStore(state => state.setWaitingRoom);

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const room = await apiClient.createGameRoom(GameType.NavalBattle);
      setWaitingRoom(room);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose} />
      <SafeAreaView style={styles.sheetWrapper} pointerEvents="box-none" edges={['bottom']}>
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />
          <Text style={styles.title}>Create Game Room</Text>

          <View style={styles.field}>
            <Text style={[type.label, styles.label]}>Select game</Text>
            <View style={styles.gameRow}>
              <View style={styles.gameRowLeft}>
                <View style={styles.gameIcon}>
                  <Icon type="crosshair" color={colors.accent} size={20} />
                </View>
                <Text style={styles.gameName}>Battleships</Text>
              </View>
              {/* Only one game type exists today, so there's nothing to pick. */}
              <Icon type="chevron-down" color={colors.textMuted} size={20} />
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label="Create Room"
            onPress={handleCreate}
            loading={isCreating}
            disabled={isCreating}
          />
          <Button label="Cancel" variant="ghost" size="md" onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheetWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: display.bold,
    fontSize: 28,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textMuted,
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  gameRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  gameIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameName: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  error: {
    ...type.caption,
    color: colors.danger,
  },
});
