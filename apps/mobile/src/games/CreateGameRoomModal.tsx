import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, GameType } from '@gaming-platform/core';

import { apiClient } from '../api/client';
import { GradientView } from '../components/GradientView';
import Icon from '../components/Icon';
import { useGameStore } from '../store/game.store';
import { brandGradient, colors, radius, spacing } from '../theme/colors';
import { fonts } from '../theme/typography';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Bottom-sheet modal for creating a game room. Only asks for the game type —
 * Betting Asset / Entry Fee / Private Room from the Figma design aren't
 * backed by anything server-side yet, so they're left out rather than
 * shipping controls that don't do anything.
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
      <SafeAreaView style={styles.sheetWrapper} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />
          <Text style={styles.title}>Create Game Room</Text>

          <View style={styles.field}>
            <Text style={styles.label}>SELECT GAME</Text>
            <View style={styles.gameRow}>
              <View style={styles.gameRowLeft}>
                <View style={styles.gameIcon}>
                  <Icon type="ship" color={colors.textPrimary} size={18} />
                </View>
                <Text style={styles.gameName}>Battleships</Text>
              </View>
              {/* Only one game type exists today, so there's nothing to pick. */}
              <Icon type="chevron-down" color={colors.textMuted} size={20} />
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={handleCreate}
            disabled={isCreating}
            style={styles.createButtonWrapper}
          >
            <GradientView
              colors={brandGradient.colors}
              positions={brandGradient.positions}
              style={styles.createButton}
            >
              {isCreating ? (
                <ActivityIndicator color={colors.textPrimary} />
              ) : (
                <Text style={styles.createButtonText}>Create Room</Text>
              )}
            </GradientView>
          </Pressable>
          <Pressable onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
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
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.hero,
    borderTopRightRadius: radius.hero,
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 10,
    backgroundColor: colors.textMuted,
    opacity: 0.3,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 28,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.chip,
    padding: spacing.sm,
  },
  gameRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 6,
  },
  gameIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameName: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
  },
  error: {
    fontSize: 13,
    color: colors.danger,
  },
  createButtonWrapper: {
    width: '100%',
  },
  createButton: {
    height: 56,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  cancelButton: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: colors.textMuted,
  },
});
