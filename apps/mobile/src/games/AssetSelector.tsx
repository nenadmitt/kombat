import { Pressable, StyleSheet, Text, View } from 'react-native';
import { STAKE_ASSET_SYMBOLS, StakeAsset } from '@gaming-platform/core';

import BrandIcon, { type BrandIconName } from '../components/BrandIcon';
import { colors, radius, spacing } from '../theme/colors';
import { mono } from '../theme/typography';

/** 'free' (no stake) plus the real stake assets. */
export type AssetChoice = 'free' | StakeAsset;

type CoinOption = {
  /** A real stake asset, or 'usdt' - a display-only coin not yet stakeable. */
  key: StakeAsset | 'usdt';
  label: string;
  brand: BrandIconName;
  /** Not on this network's escrow allowlist yet - greyed and unpressable. */
  disabled?: boolean;
};

/**
 * The single source of truth for which assets a staked game can use and how
 * each renders. Change a coin's icon, label, order, or availability here and
 * every `<AssetSelector />` across the app updates with it.
 */
const COIN_OPTIONS: CoinOption[] = [
  { key: StakeAsset.Usdc, label: STAKE_ASSET_SYMBOLS[StakeAsset.Usdc], brand: 'usdc' },
  { key: StakeAsset.Kombat, label: STAKE_ASSET_SYMBOLS[StakeAsset.Kombat], brand: 'kombat' },
  { key: StakeAsset.Native, label: STAKE_ASSET_SYMBOLS[StakeAsset.Native], brand: 'eth' },
  { key: 'usdt', label: 'USDT', brand: 'usdt', disabled: true },
];

type Props = {
  value: AssetChoice;
  onChange: (value: AssetChoice) => void;
};

/**
 * Reusable asset picker for staked games: a row of coin chips (each a real
 * brand mark) plus a full-width "No Stake" card. Controlled - the parent owns
 * the value and any side effects (e.g. resetting the entry fee).
 */
export default function AssetSelector({ value, onChange }: Props) {
  return (
    <View>
      <View style={styles.row}>
        {COIN_OPTIONS.map(coin => {
          const active = coin.key === value;
          const disabled = coin.disabled ?? false;
          return (
            <Pressable
              key={String(coin.key)}
              disabled={disabled}
              onPress={() => {
                if (coin.key !== 'usdt') onChange(coin.key);
              }}
              style={[
                styles.chip,
                active && styles.chipActive,
                disabled && styles.chipDisabled,
              ]}
            >
              <BrandIcon
                type={coin.brand}
                size={22}
                mono={disabled ? colors.textFaint : undefined}
              />
              <Text
                style={[
                  styles.chipText,
                  active && styles.chipTextActive,
                  disabled && styles.chipTextDisabled,
                ]}
              >
                {coin.label}
              </Text>
              {disabled ? <Text style={styles.soon}>SOON</Text> : null}
            </Pressable>
          );
        })}
      </View>

      {/* No Stake - the free option, on its own row below the coins. */}
      <Pressable
        onPress={() => onChange('free')}
        style={[styles.noStake, value === 'free' && styles.chipActive]}
      >
        <Text
          style={[styles.noStakeText, value === 'free' && styles.chipTextActive]}
        >
          No Stake
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipDisabled: {
    opacity: 0.45,
  },
  chipText: {
    fontFamily: mono.semiBold,
    fontSize: 12,
    color: colors.textSecondary,
  },
  chipTextActive: {
    fontFamily: mono.bold,
    color: colors.onAccent,
  },
  chipTextDisabled: {
    color: colors.textFaint,
  },
  soon: {
    fontFamily: mono.bold,
    fontSize: 8,
    letterSpacing: 1,
    color: colors.textFaint,
  },
  noStake: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
    paddingVertical: 14,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  noStakeText: {
    fontFamily: mono.semiBold,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
