import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  STAKE_ASSET_SYMBOLS,
  StakeAsset,
  type LobbyRoomFilters,
  type LobbyStakeFilter,
} from '@gaming-platform/core';

import BrandIcon, { type BrandIconName } from '../components/BrandIcon';
import Icon from '../components/Icon';
import { Button } from '../components/ui';
import { EMPTY_FILTERS } from '../store/lobby.store';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';

const GAP = 13;

const STAKE_OPTIONS: { key: LobbyStakeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'free', label: 'Free' },
  { key: 'staked', label: 'Staked' },
];

const TOKEN_OPTIONS: { key: StakeAsset; brand: BrandIconName }[] = [
  { key: StakeAsset.Usdc, brand: 'usdc' },
  { key: StakeAsset.Usdt, brand: 'usdt' },
  { key: StakeAsset.Dai, brand: 'dai' },
  { key: StakeAsset.Kombat, brand: 'kombat' },
];

type Props = {
  visible: boolean;
  filters: LobbyRoomFilters;
  onApply: (filters: LobbyRoomFilters) => void;
  onClose: () => void;
};

export default function LobbyFilterSheet({
  visible,
  filters,
  onApply,
  onClose,
}: Props) {
  const [stake, setStake] = useState<LobbyStakeFilter>(filters.stake ?? 'all');
  const [tokens, setTokens] = useState<StakeAsset[]>(filters.stakeTokens ?? []);

  useEffect(() => {
    if (visible) {
      setStake(filters.stake ?? 'all');
      setTokens(filters.stakeTokens ?? []);
    }
  }, [visible, filters]);

  if (!visible) return null;

  const toggleToken = (token: StakeAsset) =>
    setTokens(prev =>
      prev.includes(token) ? prev.filter(t => t !== token) : [...prev, token],
    );

  const apply = () => {
    const staked = stake !== 'free';
    onApply({
      ...filters,
      stake,
      stakeTokens: staked ? tokens : [],
    });
  };

  const clear = () => {
    onApply({ ...filters, stake: EMPTY_FILTERS.stake, stakeTokens: [] });
  };

  const tokensDisabled = stake === 'free';

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <SafeAreaView style={styles.wrapper} edges={['bottom']} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />
          <Text style={styles.title}>Filters</Text>

          <View style={styles.field}>
            <Text style={[type.label, styles.label]}>Stake</Text>
            <View style={styles.segment}>
              {STAKE_OPTIONS.map(opt => {
                const active = stake === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setStake(opt.key)}
                    style={[styles.segOpt, active && styles.segOptActive]}
                  >
                    <Text style={[styles.segText, active && styles.segTextActive]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.field, tokensDisabled && styles.dimmed]}>
            <Text style={[type.label, styles.label]}>Token</Text>
            <View style={styles.tokenRow}>
              {TOKEN_OPTIONS.map(opt => {
                const active = tokens.includes(opt.key);
                return (
                  <Pressable
                    key={opt.key}
                    disabled={tokensDisabled}
                    onPress={() => toggleToken(opt.key)}
                    style={[styles.tokenChip, active && styles.tokenChipActive]}
                  >
                    <BrandIcon type={opt.brand} size={20} />
                    <Text
                      style={[styles.tokenText, active && styles.tokenTextActive]}
                    >
                      {STAKE_ASSET_SYMBOLS[opt.key]}
                    </Text>
                    {active ? (
                      <Icon type="check" color={colors.onAccent} size={13} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Button label="Apply" onPress={apply} />
          <Button label="Clear stake filters" variant="ghost" size="md" onPress={clear} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6,6,9,0.7)',
  },
  wrapper: {
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
    gap: GAP,
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
    fontSize: 22,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  field: {
    gap: GAP,
  },
  dimmed: {
    opacity: 0.4,
  },
  label: {
    color: colors.textMuted,
  },
  segment: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  segOpt: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  segOptActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  segText: {
    fontFamily: mono.semiBold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  segTextActive: {
    fontFamily: mono.bold,
    color: colors.onAccent,
  },
  tokenRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  tokenChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  tokenChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  tokenText: {
    fontFamily: mono.semiBold,
    fontSize: 12,
    color: colors.textSecondary,
  },
  tokenTextActive: {
    fontFamily: mono.bold,
    color: colors.onAccent,
  },
});
