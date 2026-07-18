import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ApiError,
  GameType,
  StakeAsset,
  parseStakeAmount,
} from '@gaming-platform/core';

import { apiClient } from '../api/client';
import Icon from '../components/Icon';
import { Button, Stepper, Toggle } from '../components/ui';
import { useGameStore } from '../store/game.store';
import { colors, radius, spacing } from '../theme/colors';
import { display, type } from '../theme/typography';
import AssetSelector, { type AssetChoice } from './AssetSelector';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Per-asset stepper behavior (human units). */
const FEE_CONFIG: Record<StakeAsset, { initial: number; step: number; min: number; fmt: (v: number) => string }> = {
  [StakeAsset.Usdc]: { initial: 10, step: 1, min: 1, fmt: v => v.toFixed(2) },
  [StakeAsset.Kombat]: { initial: 10, step: 1, min: 1, fmt: v => v.toFixed(2) },
  [StakeAsset.Native]: { initial: 0.01, step: 0.005, min: 0.001, fmt: v => v.toFixed(3) },
};

/**
 * Bottom-sheet modal for creating a game room: game type (only Battleships
 * exists), the betting asset (or FREE) and the entry fee. Stakes are pulled
 * on-chain only once an opponent joins.
 */
/** The playable catalog this modal offers. */
const GAME_CHOICES: { gameType: GameType; label: string; icon: 'crosshair' | 'dice' | 'hand'; blurb: string }[] = [
  { gameType: GameType.NavalBattle, label: 'Battleships', icon: 'crosshair', blurb: '1v1 naval strategy' },
  { gameType: GameType.Ludo, label: 'Ludo Royale', icon: 'dice', blurb: '2-4 players, classic rules' },
  { gameType: GameType.TripleCut, label: 'Triple Cut', icon: 'hand', blurb: '1v1 rock-paper-scissors, best of 5' },
];

export default function CreateGameRoomModal({ visible, onClose }: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameType, setGameType] = useState<GameType>(GameType.NavalBattle);
  const [gamePickerOpen, setGamePickerOpen] = useState(false);
  const [asset, setAsset] = useState<AssetChoice>('free');
  const [fee, setFee] = useState(10);
  const [isPrivate, setIsPrivate] = useState(false);
  const setWaitingRoom = useGameStore(state => state.setWaitingRoom);

  const selectAsset = (choice: AssetChoice) => {
    setAsset(choice);
    if (choice !== 'free') {
      setFee(FEE_CONFIG[choice].initial);
    }
  };

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    try {
      // Format through the asset's display precision first - raw float math
      // (0.01 + 0.005) can carry fp dust that parseStakeAmount would reject.
      const stake =
        asset === 'free'
          ? undefined
          : {
              token: asset,
              amount: parseStakeAmount(FEE_CONFIG[asset].fmt(fee), asset),
            };
      const room = await apiClient.createGameRoom(gameType, stake, isPrivate);
      setWaitingRoom(room);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setIsCreating(false);
    }
  };

  const feeConfig = asset === 'free' ? null : FEE_CONFIG[asset];

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
          {(gamePickerOpen ? GAME_CHOICES : GAME_CHOICES.filter(g => g.gameType === gameType)).map(choice => {
            const selected = choice.gameType === gameType;
            return (
              <Pressable
                key={choice.gameType}
                style={[styles.gameRow, gamePickerOpen && selected && styles.gameRowSelected]}
                onPress={() => {
                  if (gamePickerOpen) {
                    setGameType(choice.gameType);
                  }
                  setGamePickerOpen(open => !open);
                }}
              >
                <View style={styles.gameIcon}>
                  <Icon type={choice.icon} color={colors.accent} size={20} />
                </View>
                <View style={styles.gameText}>
                  <Text style={styles.gameName}>{choice.label}</Text>
                  <Text style={styles.gameBlurb}>{choice.blurb}</Text>
                </View>
                {!gamePickerOpen ? (
                  <Icon type="chevron-down" color={colors.textMuted} size={20} />
                ) : selected ? (
                  <Icon type="check" color={colors.accent} size={18} />
                ) : null}
              </Pressable>
            );
          })}

          {/* Asset */}
          <Text style={[type.label, styles.label]}>Asset</Text>
          <AssetSelector value={asset} onChange={selectAsset} />

          {/* Entry fee (staked games only) */}
          {feeConfig ? (
            <>
              <Text style={[type.label, styles.label]}>Entry fee</Text>
              <Stepper
                value={fee}
                onChange={setFee}
                step={feeConfig.step}
                min={feeConfig.min}
                format={feeConfig.fmt}
                editable
              />
              <Text style={styles.feeHint}>
                {gameType === GameType.Ludo
                  ? 'Every player stakes this amount - winner takes the whole pot minus the platform fee.'
                  : 'Both players stake this amount - winner takes the pot minus the platform fee.'}
              </Text>
            </>
          ) : (
            <Text style={styles.feeHint}>
              No stake - nothing wagered, just bragging rights.
            </Text>
          )}

          {/* Private room */}
          <View style={styles.privateRow}>
            <View style={styles.privateText}>
              <Text style={styles.privateTitle}>Private Room</Text>
              <Text style={styles.privateSub}>Hidden from the lobby, share the code to invite</Text>
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
    marginBottom: 6,
  },
  gameRowSelected: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  gameText: {
    flex: 1,
    gap: 1,
  },
  gameBlurb: {
    ...type.caption,
    color: colors.textMuted,
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
    ...type.subheading,
    color: colors.textPrimary,
  },
  feeHint: {
    ...type.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
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
