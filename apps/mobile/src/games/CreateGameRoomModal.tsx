import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ApiError,
  GameType,
  isMultiSeatGame,
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
import GamePickerSheet, { type GameChoice } from './GamePickerSheet';

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
const GAME_CHOICES: GameChoice[] = [
  { gameType: GameType.NavalBattle, label: 'Battleships', icon: 'crosshair', blurb: '1v1 naval strategy' },
  { gameType: GameType.Ludo, label: 'Ludo Royale', icon: 'dice', blurb: '2-4 players, classic rules' },
  { gameType: GameType.TripleCut, label: 'Triple Cut', icon: 'hand', blurb: '1v1 rock-paper-scissors, best of 5' },
  { gameType: GameType.ChromaClash, label: 'Chroma Clash', icon: 'layers', blurb: '2-4 players, shed your hand first' },
];

export default function CreateGameRoomModal({ visible, onClose }: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameType, setGameType] = useState<GameType>(GameType.NavalBattle);
  const [gamePickerVisible, setGamePickerVisible] = useState(false);
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
  const selectedGame =
    GAME_CHOICES.find(g => g.gameType === gameType) ?? GAME_CHOICES[0];

  return (
    <>
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

            {/* Select game (opens the searchable picker) */}
            <View style={styles.field}>
              <Text style={[type.label, styles.label]}>Select game</Text>
              <Pressable
                style={styles.gameRow}
                onPress={() => setGamePickerVisible(true)}
              >
                <View style={styles.gameIcon}>
                  <Icon type={selectedGame.icon} color={colors.accentLight} size={20} />
                </View>
                <View style={styles.gameText}>
                  <Text style={styles.gameName}>{selectedGame.label}</Text>
                  <Text style={styles.gameBlurb}>{selectedGame.blurb}</Text>
                </View>
                <Icon type="chevron-down" color={colors.textMuted} size={20} />
              </Pressable>
            </View>

            {/* Asset */}
            <View style={styles.field}>
              <Text style={[type.label, styles.label]}>Asset</Text>
              <AssetSelector value={asset} onChange={selectAsset} />
            </View>

            {/* Entry fee (staked games only) */}
            {feeConfig ? (
              <View style={styles.field}>
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
                  {isMultiSeatGame(gameType)
                    ? 'Every player stakes this amount - winner takes the whole pot minus the platform fee.'
                    : 'Both players stake this amount - winner takes the pot minus the platform fee.'}
                </Text>
              </View>
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
            />
            <Button label="Cancel" variant="ghost" size="md" onPress={onClose} />
          </View>
        </SafeAreaView>
      </Modal>

      <GamePickerSheet
        visible={gamePickerVisible}
        choices={GAME_CHOICES}
        selected={gameType}
        onSelect={gt => {
          setGameType(gt);
          setGamePickerVisible(false);
        }}
        onClose={() => setGamePickerVisible(false)}
      />
    </>
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
    // One uniform vertical rhythm between every block in the sheet.
    gap: spacing.md,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
  },
  title: {
    fontFamily: display.bold,
    fontSize: 26,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  // A label + its control, grouped tighter than the block rhythm.
  field: {
    gap: spacing.sm,
  },
  label: {
    color: colors.textMuted,
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
  gameText: {
    flex: 1,
    gap: spacing.xxs,
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
  },
  privateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  privateText: {
    // Flex so the long copy wraps and never pushes the Toggle off-screen.
    flex: 1,
    gap: spacing.xxs,
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
  },
});
