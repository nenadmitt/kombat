import { formatStakeAmount, type StakePotBalances } from '@gaming-platform/core';
import Clipboard from '@react-native-clipboard/clipboard';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { TokenBalance } from '../../store/walletBalances.store';
import { colors, radius, spacing } from '../../theme/colors';
import { mono, type } from '../../theme/typography';
import type { ChainId } from '../../wallet/chains';
import { truncateAddress } from '../../wallet/format-address';
import { POT_ASSETS } from '../../wallet/stake-pot-assets';
import { CHAIN_TOKENS, supportsBalances, type TokenSymbol } from '../../wallet/tokens';
import BrandIcon from '../BrandIcon';
import Icon, { type IconName } from '../Icon';
import { Card } from '../ui';

/** Token mark in an asset row. */
const ICON_TILE = 40;
/** Square affordance: copy / QR. */
const MINI_TILE = 32;

const ACTIONS = [
  { key: 'receive', label: 'Receive', icon: 'arrow-down' as IconName },
  { key: 'deposit', label: 'Deposit', icon: 'plus' as IconName },
  { key: 'withdraw', label: 'Send', icon: 'arrow-up' as IconName },
] as const;

export type WalletAction = (typeof ACTIONS)[number]['key'];

type Props = {
  address: string;
  chainId: ChainId;
  balances: Partial<Record<TokenSymbol, TokenBalance>>;
  /** Pot balances, so a row can say how much of that token is already staked. */
  pot: StakePotBalances;
  loading: boolean;
  /** Null while the manual refresh is on cooldown or unavailable. */
  onRefresh: (() => void) | null;
  error: string | null;
  onAction: (action: WalletAction) => void;
  onShowQr: () => void;
};

/**
 * The wallet tab: the custodial address, money in and out, and every token
 * held on the selected chain. A row that also has funds in the pot says so,
 * because the two balances are easy to confuse.
 */
export default function WalletAssetsTab({
  address,
  chainId,
  balances,
  pot,
  loading,
  onRefresh,
  error,
  onAction,
  onShowQr,
}: Props) {
  const tokens = supportsBalances(chainId) ? CHAIN_TOKENS[chainId] : [];

  return (
    <>
      <Card style={styles.addressCard}>
        <View style={styles.addressHead}>
          <View style={styles.addressLabelRow}>
            <Icon type="wallet" color={colors.accent} size={14} />
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
              <Icon type="copy" color={colors.accent100} size={16} />
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
              <Icon type="qr-code" color={colors.textPrimary} size={16} />
            </Pressable>
          </View>
        </View>
        <Text
          style={styles.address}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {truncateAddress(address, 6, 6)}
        </Text>
      </Card>

      <View style={styles.actionRow}>
        {ACTIONS.map(action => (
          <Card
            key={action.key}
            style={styles.actionCard}
            onPress={() => onAction(action.key)}
          >
            <Icon type={action.icon} color={colors.accent} size={20} />
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Card>
        ))}
      </View>

      <View style={styles.assetsHeader}>
        <Text style={styles.assetsLabel}>Assets</Text>
        <Pressable
          onPress={() => onRefresh?.()}
          disabled={!onRefresh || loading}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Refresh balances"
          style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <>
              <Icon
                type="refresh"
                size={14}
                color={onRefresh ? colors.textMuted : colors.textFaint}
              />
              <Text style={styles.refreshLabel}>Refresh</Text>
            </>
          )}
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View>
        {tokens.map((token, index) => {
          const balance = balances[token.symbol];
          const staked = stakedAmount(token.symbol, pot);
          return (
            <View
              key={token.symbol}
              style={[styles.row, index < tokens.length - 1 && styles.rowRule]}
            >
              {token.brand ? (
                <View style={styles.tokenIcon}>
                  <BrandIcon type={token.brand} size={ICON_TILE} />
                </View>
              ) : (
                <View style={[styles.tokenCircle, { backgroundColor: token.tint }]}>
                  <Text style={styles.tokenGlyph}>{token.glyph}</Text>
                </View>
              )}
              <View style={styles.rowMid}>
                <Text style={styles.symbol}>{token.symbol}</Text>
                {staked ? (
                  <Text style={styles.rowSub}>
                    <Text style={styles.staked}>{staked}</Text> in pot
                  </Text>
                ) : (
                  <Text style={styles.rowSub}>{token.name}</Text>
                )}
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.balance}>{balance?.formatted ?? '-'}</Text>
                <Text style={styles.usd}>
                  {token.stable && balance?.raw != null
                    ? `$${balance.formatted}`
                    : token.symbol}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </>
  );
}

/** What this token already holds in the pot, formatted, or null if none. */
function stakedAmount(symbol: TokenSymbol, pot: StakePotBalances): string | null {
  const entry = POT_ASSETS.find(a => a.symbol === symbol);
  if (!entry) {
    return null;
  }
  const total =
    BigInt(pot.available[entry.asset]) + BigInt(pot.locked[entry.asset]);
  return total > 0n ? formatStakeAmount(total.toString(), entry.asset) : null;
}

const styles = StyleSheet.create({
  addressCard: {
    gap: spacing.sm,
  },
  addressHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addressLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  addressLabel: {
    ...type.label,
    color: colors.textMuted,
  },
  addressActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  addressBtn: {
    width: MINI_TILE,
    height: MINI_TILE,
    borderRadius: radius.sm,
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
    fontFamily: mono.bold,
    fontSize: 26,
    letterSpacing: -0.3,
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
    // Card pads spacing.md horizontally; match it vertically so the tile's
    // inset is equal on all four sides.
    paddingVertical: spacing.md,
  },
  actionLabel: {
    ...type.body,
    fontFamily: type.button.fontFamily,
    fontSize: 14,
    color: colors.textPrimary,
  },
  assetsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  assetsLabel: {
    ...type.label,
    color: colors.textMuted,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  refreshLabel: {
    ...type.label,
    color: colors.textMuted,
  },
  error: {
    ...type.caption,
    color: colors.danger,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowRule: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tokenIcon: {
    width: ICON_TILE,
    height: ICON_TILE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenCircle: {
    width: ICON_TILE,
    height: ICON_TILE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenGlyph: {
    fontFamily: mono.bold,
    fontSize: 18,
    color: colors.onAccent,
  },
  rowMid: {
    flex: 1,
    gap: spacing.xxs,
  },
  symbol: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  rowSub: {
    ...type.caption,
    color: colors.textMuted,
  },
  staked: {
    fontFamily: mono.bold,
    color: colors.gold,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: spacing.xxs,
  },
  balance: {
    fontFamily: mono.bold,
    fontSize: 18,
    color: colors.textPrimary,
  },
  usd: {
    ...type.caption,
    color: colors.textMuted,
  },
});
