import { StakeAsset } from '@gaming-platform/core';
import Clipboard from '@react-native-clipboard/clipboard';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { TokenBalance } from '../../store/walletBalances.store';
import { colors, radius, spacing } from '../../theme/colors';
import { mono, type } from '../../theme/typography';
import type { ChainId } from '../../wallet/chains';
import { MOCK_TRENDS } from '../../wallet/market-mock';
import { POT_ASSETS } from '../../wallet/stake-pot-assets';
import { CHAIN_TOKENS, supportsBalances, type TokenSymbol } from '../../wallet/tokens';
import BrandIcon from '../BrandIcon';
import Icon, { type IconName } from '../Icon';
import { Card } from '../ui';
import ChainSelector from './ChainSelector';

const ACTIONS = [
  { key: 'receive', label: 'Receive', icon: 'arrow-down' as IconName },
  { key: 'deposit', label: 'Deposit', icon: 'plus' as IconName },
  { key: 'withdraw', label: 'Withdraw', icon: 'arrow-up' as IconName },
] as const;

export type WalletAction = (typeof ACTIONS)[number]['key'];

/** The pot asset a wallet token can be staked as, if it has one at all. */
const STAKE_ASSET_BY_SYMBOL = new Map<TokenSymbol, StakeAsset>(
  POT_ASSETS.map(({ asset, symbol }) => [symbol, asset]),
);

type Props = {
  address: string;
  chainId: ChainId;
  onSelectChain: (chainId: ChainId) => void;
  balances: Partial<Record<TokenSymbol, TokenBalance>>;
  loading: boolean;
  /** Manual refresh is null while it is on cooldown or unavailable. */
  onRefresh: (() => void) | null;
  error: string | null;
  onAction: (action: WalletAction) => void;
  /** Null when the server runs without pooled staking - no Stake buttons. */
  onStake: ((asset: StakeAsset) => void) | null;
  onShowQr: () => void;
};

/**
 * The wallet tab: the network the app is reading, the custodial address, the
 * money in and out, and every token held on that chain. Staked funds are not
 * here - they live in the stake pot tab - so the assets header says so.
 */
export default function WalletAssetsTab({
  address,
  chainId,
  onSelectChain,
  balances,
  loading,
  onRefresh,
  error,
  onAction,
  onStake,
  onShowQr,
}: Props) {
  const tokens = supportsBalances(chainId) ? CHAIN_TOKENS[chainId] : [];

  return (
    <>
      <ChainSelector
        variant="row"
        evmAddress={address}
        selected={chainId}
        onSelect={onSelectChain}
      />

      <Card style={styles.addressCard}>
        <View style={styles.addressHead}>
          <View style={styles.addressLabelRow}>
            <Icon type="wallet" color={colors.accent} size={12} />
            <Text style={styles.addressLabel}>Your address</Text>
          </View>
          <View style={styles.addressActions}>
            <Pressable
              onPress={() => Clipboard.setString(address)}
              accessibilityRole="button"
              accessibilityLabel="Copy wallet address"
              hitSlop={6}
              style={({ pressed }) => [
                styles.addressBtn,
                styles.addressBtnAccent,
                pressed && styles.pressed,
              ]}
            >
              <Icon type="copy" color={colors.accent100} size={14} />
            </Pressable>
            <Pressable
              onPress={onShowQr}
              accessibilityRole="button"
              accessibilityLabel="Show address QR code"
              hitSlop={6}
              style={({ pressed }) => [
                styles.addressBtn,
                styles.addressBtnPlain,
                pressed && styles.pressed,
              ]}
            >
              <Icon type="qr-code" color={colors.textPrimary} size={14} />
            </Pressable>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.address}>
          {address}
        </Text>
      </Card>

      <View style={styles.actionRow}>
        {ACTIONS.map(action => (
          <Card
            key={action.key}
            style={styles.actionCard}
            onPress={() => onAction(action.key)}
          >
            <Icon type={action.icon} color={colors.accent} size={18} />
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Card>
        ))}
      </View>

      <View style={styles.assetsHeader}>
        <Text style={styles.assetsLabel}>Assets</Text>
        <View style={styles.assetsHeaderRight}>
          <Text style={styles.assetsNote}>Not staked</Text>
          <Pressable
            onPress={() => onRefresh?.()}
            disabled={!onRefresh || loading}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Refresh balances"
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.accentLight} />
            ) : (
              <Icon
                type="refresh"
                size={16}
                color={onRefresh ? colors.accentLight : colors.textFaint}
              />
            )}
          </Pressable>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.list}>
        {tokens.map(token => {
          const balance = balances[token.symbol];
          const trend = MOCK_TRENDS[token.symbol];
          const stakeAsset = STAKE_ASSET_BY_SYMBOL.get(token.symbol);
          const highlight = token.symbol === 'KOMBAT';
          return (
            <Card
              key={token.symbol}
              flush
              style={[styles.assetCard, highlight && styles.assetHighlight]}
            >
              {token.brand ? (
                <View style={styles.tokenIcon}>
                  <BrandIcon type={token.brand} size={42} />
                </View>
              ) : (
                <View style={[styles.tokenCircle, { backgroundColor: token.tint }]}>
                  <Text style={styles.tokenGlyph}>{token.glyph}</Text>
                </View>
              )}
              <View style={styles.assetMid}>
                <View style={styles.assetSymbolRow}>
                  <Text style={styles.assetSymbol}>{token.symbol}</Text>
                  <View
                    style={[
                      styles.trendBadge,
                      {
                        backgroundColor: trend.up
                          ? colors.successSoft
                          : colors.dangerSoft,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.trendText,
                        { color: trend.up ? colors.success : colors.danger },
                      ]}
                    >
                      {trend.pct}
                    </Text>
                  </View>
                </View>
                <Text style={styles.assetName}>{token.name}</Text>
              </View>
              <View style={styles.assetRight}>
                <Text style={styles.assetBalance}>{balance?.formatted ?? '-'}</Text>
                <Text style={styles.assetUsd}>
                  {token.stable && balance?.raw != null
                    ? `$${balance.formatted}`
                    : token.symbol}
                </Text>
              </View>
              {onStake && stakeAsset !== undefined ? (
                <Pressable
                  onPress={() => onStake(stakeAsset)}
                  accessibilityRole="button"
                  accessibilityLabel={`Stake ${token.symbol}`}
                  style={({ pressed }) => [
                    styles.stakeBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.stakeLabel}>Stake</Text>
                </Pressable>
              ) : null}
            </Card>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  addressCard: {
    gap: spacing.sm,
    padding: spacing.sm,
  },
  addressHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addressLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  addressLabel: {
    ...type.label,
    color: colors.textMuted,
  },
  addressActions: {
    flexDirection: 'row',
    gap: 7,
  },
  addressBtn: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressBtnAccent: {
    backgroundColor: colors.accentSoft,
  },
  addressBtnPlain: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  address: {
    fontFamily: mono.semiBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.7,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  actionLabel: {
    ...type.caption,
    fontFamily: type.button.fontFamily,
    fontSize: 12,
    color: colors.textPrimary,
  },
  assetsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  assetsLabel: {
    ...type.label,
    fontSize: 12,
    color: colors.textMuted,
  },
  assetsHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  assetsNote: {
    ...type.label,
    color: colors.textMuted,
  },
  refreshBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    ...type.caption,
    color: colors.danger,
  },
  list: {
    gap: spacing.sm,
  },
  assetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  assetHighlight: {
    borderColor: colors.gold,
  },
  tokenIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenCircle: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenGlyph: {
    fontFamily: mono.bold,
    fontSize: 19,
    color: colors.onAccent,
  },
  assetMid: {
    flex: 1,
    gap: 5,
  },
  assetSymbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  assetSymbol: {
    ...type.subheading,
    fontSize: 15,
    color: colors.textPrimary,
  },
  trendBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  trendText: {
    fontFamily: mono.semiBold,
    fontSize: 10,
  },
  assetName: {
    ...type.caption,
    fontSize: 11,
    color: colors.textMuted,
  },
  assetRight: {
    alignItems: 'flex-end',
    gap: 5,
  },
  assetBalance: {
    fontFamily: mono.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  assetUsd: {
    ...type.caption,
    fontSize: 10.5,
    color: colors.textMuted,
  },
  stakeBtn: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.goldBorder,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  stakeLabel: {
    fontFamily: mono.bold,
    fontSize: 11,
    color: colors.gold,
  },
});
