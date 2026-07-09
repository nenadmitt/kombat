import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, GameType } from '@gaming-platform/core';

import { apiClient } from '../api/client';
import Icon from '../components/Icon';
import { Button, Stepper, Toggle } from '../components/ui';
import { useGameStore } from '../store/game.store';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const BETTING_ASSETS = ['USDC', 'USDT', 'ETH', 'KMBT'] as const;

/**
 * Bottom-sheet modal for creating a game room. The game type is all the
 * backend accepts today; betting asset, entry fee and private-room are local
 * UI state (design 1d) — collected here and ready to wire up once the create
 * endpoint takes them.
 */
export default function CreateGameRoomModal({ visible, onClose }: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asset, setAsset] = useState<(typeof BETTING_ASSETS)[number]>('USDC');
  const [fee, setFee] = useState(10);
  const [isPrivate, setIsPrivate] = useState(false);
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

          {/* Select game */}
          <Text style={[type.label, styles.label]}>Select game</Text>
          <View style={styles.gameRow}>
            <View style={styles.gameIcon}>
              <Icon type="crosshair" color={colors.accent} size={20} />
            </View>
            <Text style={styles.gameName}>Battleships</Text>
            <Icon type="chevron-down" color={colors.textMuted} size={20} />
          </View>

          {/* Betting asset */}
          <Text style={[type.label, styles.label]}>Betting asset</Text>
          <View style={styles.assetRow}>
            {BETTING_ASSETS.map(a => {
              const active = a === asset;
              return (
                <Pressable
                  key={a}
                  onPress={() => setAsset(a)}
                  style={[styles.assetChip, active && styles.assetChipActive]}
                >
                  <Text style={[styles.assetText, active && styles.assetTextActive]}>
                    {a}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Entry fee */}
          <Text style={[type.label, styles.label]}>Entry fee</Text>
          <Stepper value={fee} onChange={setFee} step={1} min={1} />

          {/* Private room */}
          <View style={styles.privateRow}>
            <View style={styles.privateText}>
              <Text style={styles.privateTitle}>Private Room</Text>
              <Text style={styles.privateSub}>Invite friends via link</Text>
            </View>
            <Toggle value={isPrivate} onValueChange={setIsPrivate} />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label="Create Room"
            onPress={handleCreate}
            loading={isCreating}
            disabled={isCreating}
            style={styles.createButton}
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
    backgroundColor: 'rgba(6,6,9,0.7)',
  },
  sheetWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: display.bold,
    fontSize: 26,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  label: {
    color: colors.textMuted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  gameIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameName: {
    flex: 1,
    ...type.subheading,
    color: colors.textPrimary,
  },
  assetRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  assetChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  assetChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  assetText: {
    fontFamily: mono.semiBold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  assetTextActive: {
    fontFamily: mono.bold,
    color: colors.onAccent,
  },
  privateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  privateText: {
    gap: 2,
  },
  privateTitle: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  privateSub: {
    ...type.caption,
    color: colors.textMuted,
  },
  error: {
    ...type.caption,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  createButton: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
});
