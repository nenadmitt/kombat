import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ApiError,
  GameType,
  isMultiSeatGame,
  STAKE_ASSET_SYMBOLS,
  StakeAsset,
  parseStakeAmount,
} from '@gaming-platform/core';

import { apiClient } from '../api/client';
import BrandIcon, { type BrandIconName } from '../components/BrandIcon';
import Icon from '../components/Icon';
import { Button, Card, Toggle } from '../components/ui';
import { useGameStore } from '../store/game.store';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';
import GamePickerSheet, { type GameChoice } from './GamePickerSheet';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Per-asset display + quick-pick presets (human units). */
const STAKE_CONFIG: Record<
  StakeAsset,
  { brand: BrandIconName; fmt: (v: number) => string; presets: number[] }
> = {
  [StakeAsset.Usdc]: { brand: 'usdc', fmt: v => v.toFixed(2), presets: [10, 50, 100, 500] },
  [StakeAsset.Kombat]: { brand: 'kombat', fmt: v => v.toFixed(2), presets: [10, 50, 100, 500] },
  [StakeAsset.Native]: { brand: 'eth', fmt: v => v.toFixed(3), presets: [0.01, 0.05, 0.1, 0.5] },
};

const STAKE_TOKENS: StakeAsset[] = [StakeAsset.Usdc, StakeAsset.Kombat, StakeAsset.Native];

/** The playable catalog this modal offers. */
const GAME_CHOICES: GameChoice[] = [
  { gameType: GameType.NavalBattle, label: 'Battleships', icon: 'crosshair', blurb: '1v1 naval strategy · ~6 min' },
  { gameType: GameType.Ludo, label: 'Ludo Royale', icon: 'dice', blurb: '2-4 players · classic rules' },
  { gameType: GameType.TripleCut, label: 'Triple Cut', icon: 'hand', blurb: '1v1 · best of 5' },
  { gameType: GameType.ChromaClash, label: 'Chroma Clash', icon: 'layers', blurb: '2-4 players · shed your hand' },
];

/** Trim trailing zeros for pot display (228.00 -> 228). */
function trimNum(value: number): string {
  return value.toFixed(value >= 1 ? 2 : 4).replace(/\.?0+$/, '');
}

export default function CreateGameRoomModal({ visible, onClose }: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameType, setGameType] = useState<GameType>(GameType.NavalBattle);
  const [gamePickerVisible, setGamePickerVisible] = useState(false);
  /** null = free play, otherwise the staked token. */
  const [stakeToken, setStakeToken] = useState<StakeAsset | null>(null);
  const [feeInput, setFeeInput] = useState('10');
  const [tokenPickerOpen, setTokenPickerOpen] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const setWaitingRoom = useGameStore(state => state.setWaitingRoom);

  const staked = stakeToken !== null;
  const feeNum = Number(feeInput) || 0;
  const selectedGame =
    GAME_CHOICES.find(g => g.gameType === gameType) ?? GAME_CHOICES[0];

  const setMode = (mode: 'staked' | 'free') => {
    if (mode === 'free') {
      setStakeToken(null);
      return;
    }
    const token = stakeToken ?? StakeAsset.Usdc;
    setStakeToken(token);
    setFeeInput(String(STAKE_CONFIG[token].presets[0]));
  };

  const pickToken = (token: StakeAsset) => {
    setStakeToken(token);
    setFeeInput(String(STAKE_CONFIG[token].presets[0]));
    setTokenPickerOpen(false);
  };

  const players = isMultiSeatGame(gameType) ? 4 : 2;
  const winnerTakes = feeNum * players * 0.95;

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const stake =
        stakeToken === null
          ? undefined
          : {
              token: stakeToken,
              amount: parseStakeAmount(STAKE_CONFIG[stakeToken].fmt(feeNum), stakeToken),
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

  const createLabel = staked
    ? `Create Room · ${feeInput || '0'} ${STAKE_ASSET_SYMBOLS[stakeToken!]}`
    : 'Create Room';

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

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Create Game Room</Text>
              <Text style={styles.subtitle}>Set the game and stake, then invite an opponent.</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Icon type="close" color={colors.textSecondary} size={18} />
            </Pressable>
          </View>

          {/* Game */}
          <View style={styles.field}>
            <Text style={[type.label, styles.label]}>Game</Text>
            <Pressable style={styles.gameRow} onPress={() => setGamePickerVisible(true)}>
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

          {/* Stake mode */}
          <View style={styles.stakeHeader}>
            <Text style={[type.label, styles.label]}>Stake</Text>
            <View style={styles.segment}>
              <Pressable
                onPress={() => setMode('staked')}
                style={[styles.segOpt, staked && styles.segOptActive]}
              >
                <Text style={[styles.segText, staked && styles.segTextActive]}>Staked</Text>
              </Pressable>
              <Pressable
                onPress={() => setMode('free')}
                style={[styles.segOpt, !staked && styles.segOptActive]}
              >
                <Text style={[styles.segText, !staked && styles.segTextActive]}>Free play</Text>
              </Pressable>
            </View>
          </View>

          {staked && stakeToken !== null ? (
            <>
              <Card accent style={styles.stakeCard}>
                <View style={styles.amountRow}>
                  <TextInput
                    value={feeInput}
                    onChangeText={setFeeInput}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textFaint}
                    selectionColor={colors.accent}
                    cursorColor={colors.accent}
                    style={styles.amountInput}
                  />
                  <Pressable
                    onPress={() => setTokenPickerOpen(o => !o)}
                    style={styles.tokenPill}
                  >
                    <BrandIcon type={STAKE_CONFIG[stakeToken].brand} size={20} />
                    <Text style={styles.tokenPillText}>
                      {STAKE_ASSET_SYMBOLS[stakeToken]}
                    </Text>
                    <Icon type="chevron-down" color={colors.textSecondary} size={16} />
                  </Pressable>
                </View>

                {tokenPickerOpen ? (
                  <View style={styles.tokenList}>
                    {STAKE_TOKENS.map(t => (
                      <Pressable
                        key={t}
                        onPress={() => pickToken(t)}
                        style={[styles.tokenListRow, t === stakeToken && styles.tokenListRowActive]}
                      >
                        <BrandIcon type={STAKE_CONFIG[t].brand} size={20} />
                        <Text style={styles.tokenListText}>{STAKE_ASSET_SYMBOLS[t]}</Text>
                        {t === stakeToken ? (
                          <Icon type="check" color={colors.accent} size={16} />
                        ) : null}
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <View style={styles.presetRow}>
                    {STAKE_CONFIG[stakeToken].presets.map(p => {
                      const active = feeNum === p;
                      return (
                        <Pressable
                          key={p}
                          onPress={() => setFeeInput(String(p))}
                          style={[styles.preset, active && styles.presetActive]}
                        >
                          <Text style={[styles.presetText, active && styles.presetTextActive]}>
                            {p}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </Card>

              <View style={styles.winnerRow}>
                <Text style={styles.winnerKey}>Winner takes</Text>
                <Text style={styles.winnerVal}>
                  {trimNum(winnerTakes)} {STAKE_ASSET_SYMBOLS[stakeToken]}
                  <Text style={styles.winnerFee}> · 5% fee</Text>
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.freeHint}>No stake - nothing wagered, just bragging rights.</Text>
          )}

          {/* Private room */}
          <View style={styles.privateCard}>
            <View style={styles.privateIcon}>
              <Icon type="lock" color={colors.accentLight} size={18} />
            </View>
            <View style={styles.privateText}>
              <Text style={styles.privateTitle}>Private room</Text>
              <Text style={styles.privateSub}>Hidden from lobby · share a code</Text>
            </View>
            <Toggle value={isPrivate} onValueChange={setIsPrivate} />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={createLabel}
            onPress={handleCreate}
            loading={isCreating}
            disabled={isCreating}
          />
        </View>
      </SafeAreaView>

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
    // One uniform vertical rhythm between every block.
    gap: spacing.md,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    fontFamily: display.bold,
    fontSize: 26,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  subtitle: {
    ...type.body,
    color: colors.textSecondary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  gameIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.accent900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameText: {
    flex: 1,
    gap: spacing.xxs,
  },
  gameName: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  gameBlurb: {
    ...type.caption,
    color: colors.textMuted,
  },
  stakeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  segment: {
    flexDirection: 'row',
    gap: 4,
    padding: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  segOpt: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm - 2,
  },
  segOptActive: {
    backgroundColor: colors.accent,
  },
  segText: {
    fontFamily: mono.bold,
    fontSize: 12,
    color: colors.textSecondary,
  },
  segTextActive: {
    color: colors.onAccent,
  },
  stakeCard: {
    gap: spacing.sm,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  amountInput: {
    // Flex so the field width is stable and the number never truncates.
    flex: 1,
    fontFamily: mono.bold,
    fontSize: 40,
    letterSpacing: -1,
    color: colors.textPrimary,
    padding: 0,
  },
  tokenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: radius.pill,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: 7,
  },
  tokenPillText: {
    fontFamily: mono.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  tokenList: {
    gap: spacing.xs,
  },
  tokenListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  tokenListRowActive: {
    backgroundColor: colors.accentSoft,
  },
  tokenListText: {
    flex: 1,
    fontFamily: mono.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  preset: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  presetActive: {
    borderColor: colors.accent,
  },
  presetText: {
    fontFamily: mono.bold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  presetTextActive: {
    color: colors.accentLight,
  },
  winnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  winnerKey: {
    ...type.caption,
    color: colors.textMuted,
  },
  winnerVal: {
    fontFamily: mono.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  winnerFee: {
    fontFamily: mono.medium,
    color: colors.textMuted,
  },
  freeHint: {
    ...type.caption,
    color: colors.textMuted,
  },
  privateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  privateIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.accent900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privateText: {
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
