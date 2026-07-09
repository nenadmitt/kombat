import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import BrandIcon, { type BrandIconName } from '../components/BrandIcon';
import Icon, { type IconName } from '../components/Icon';
import { Card, Screen, SectionLabel } from '../components/ui';
import ChainSelector from '../components/wallet/ChainSelector';
import { useCurrentUserStore } from '../store/currentUser.store';
import { colors, radius, spacing } from '../theme/colors';
import { mono, type } from '../theme/typography';
import { CHAINS, DEFAULT_CHAIN_ID, type ChainId } from '../wallet/chains';

/** Mocked — no balance endpoint yet. Values mirror the design reference. */
const BALANCE_WHOLE = '$6,135';
const BALANCE_CENTS = '.62';
const BALANCE_CHANGE = '+12.4% this week';

type Asset = {
  symbol: string;
  name: string;
  brand?: BrandIconName;
  glyph?: string;
  tint: string;
  balance: string;
  usd: string;
  highlight?: boolean;
};

const ASSETS: Asset[] = [
  { symbol: 'USDC', name: 'USD Coin', brand: 'usdc', tint: '#2775CA', balance: '1,240.50', usd: '$1,240.50' },
  { symbol: 'USDT', name: 'Tether', brand: 'usdt', tint: '#26A17B', balance: '450.00', usd: '$450.00' },
  { symbol: 'ETH', name: 'Ethereum', brand: 'eth', tint: '#627EEA', balance: '0.45', usd: '$1,320.12' },
  { symbol: 'KOMBAT', name: 'Platform Token', glyph: '◆', tint: colors.gold, balance: '12,500', usd: '$3,125.00', highlight: true },
];

const ACTIONS = [
  { key: 'receive', label: 'Receive', icon: 'arrow-down' as IconName },
  { key: 'deposit', label: 'Deposit', icon: 'plus' as IconName },
  { key: 'withdraw', label: 'Withdraw', icon: 'arrow-up' as IconName },
] as const;

type Activity = {
  key: string;
  title: string;
  time: string;
  amount: string;
  icon: IconName;
  negative?: boolean;
};

const ACTIVITY: Activity[] = [
  { key: '1', title: 'Battleships Win', time: '2m ago', amount: '+45.00', icon: 'games' },
  { key: '2', title: 'USDC Deposit', time: '1h ago', amount: '+200.00', icon: 'arrow-down' },
  { key: '3', title: 'Ludo Loss', time: '3h ago', amount: '-10.00', icon: 'dice', negative: true },
];

export default function WalletScreen() {
  const wallet = useCurrentUserStore(state => state.wallet);
  const [chainId, setChainId] = useState<ChainId>(DEFAULT_CHAIN_ID);

  const activeChain = CHAINS.find(c => c.id === chainId) ?? CHAINS[0];

  return (
    <Screen scroll>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Wallet</Text>
          {wallet ? (
            <Text style={styles.networkNote}>
              You&apos;re on {activeChain.network}
            </Text>
          ) : null}
        </View>
        {wallet ? (
          <ChainSelector
            evmAddress={wallet.address}
            selected={chainId}
            onSelect={setChainId}
          />
        ) : null}
      </View>

      {/* Balance card */}
      <View style={styles.balanceCard}>
        <Text style={[type.label, styles.balanceLabel]}>Total balance</Text>
        <Text style={styles.balanceValue}>
          {BALANCE_WHOLE}
          <Text style={styles.balanceCents}>{BALANCE_CENTS}</Text>
        </Text>
        <View style={styles.changePill}>
          <Icon type="trending-up" color={colors.onAccent} size={13} />
          <Text style={styles.changeText}>{BALANCE_CHANGE}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionRow}>
        {ACTIONS.map(action => (
          <Card key={action.key} style={styles.actionCard} onPress={() => {}}>
            <View style={styles.actionIcon}>
              <Icon type={action.icon} color={colors.accent} size={20} />
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Card>
        ))}
      </View>

      {/* Assets */}
      <View style={styles.section}>
        <SectionLabel>Assets</SectionLabel>
        <View style={styles.list}>
          {ASSETS.map(asset => (
            <Card
              key={asset.symbol}
              flush
              style={[styles.assetCard, asset.highlight && styles.assetHighlight]}
            >
              <View style={styles.assetLeft}>
                {asset.brand ? (
                  <View style={styles.tokenIcon}>
                    <BrandIcon type={asset.brand} size={40} />
                  </View>
                ) : (
                  <View style={[styles.tokenCircle, { backgroundColor: asset.tint + '22', borderColor: asset.tint + '55' }]}>
                    <Text style={[styles.tokenGlyph, { color: asset.tint }]}>{asset.glyph}</Text>
                  </View>
                )}
                <View>
                  <Text style={styles.assetSymbol}>{asset.symbol}</Text>
                  <Text style={styles.assetName}>{asset.name}</Text>
                </View>
              </View>
              <View style={styles.assetRight}>
                <Text style={styles.assetBalance}>{asset.balance}</Text>
                <Text style={styles.assetUsd}>{asset.usd}</Text>
              </View>
            </Card>
          ))}
        </View>
      </View>

      {/* Recent activity */}
      <View style={styles.section}>
        <SectionLabel action="View all">Recent activity</SectionLabel>
        <View style={styles.list}>
          {ACTIVITY.map(item => (
            <View key={item.key} style={styles.activityRow}>
              <View style={styles.activityIcon}>
                <Icon type={item.icon} color={colors.textSecondary} size={18} />
              </View>
              <View style={styles.activityMid}>
                <Text style={styles.activityTitle}>{item.title}</Text>
                <Text style={styles.activityTime}>{item.time}</Text>
              </View>
              <Text
                style={[
                  styles.activityAmount,
                  item.negative && styles.activityAmountNeg,
                ]}
              >
                {item.amount}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  title: {
    ...type.title,
    color: colors.textPrimary,
  },
  headerLeft: {
    gap: spacing.xxs,
  },
  networkNote: {
    ...type.caption,
    color: colors.textMuted,
  },
  balanceCard: {
    backgroundColor: colors.accent,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  balanceLabel: {
    color: 'rgba(10, 10, 12, 0.6)',
  },
  balanceValue: {
    fontFamily: mono.bold,
    fontSize: 40,
    letterSpacing: -1,
    color: colors.onAccent,
  },
  balanceCents: {
    fontSize: 24,
  },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(10, 10, 12, 0.18)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  changeText: {
    fontFamily: mono.semiBold,
    fontSize: 12,
    color: colors.onAccent,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    ...type.caption,
    fontFamily: type.button.fontFamily,
    color: colors.textPrimary,
  },
  section: {
    gap: spacing.sm,
  },
  list: {
    gap: spacing.sm,
  },
  assetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  assetHighlight: {
    borderColor: colors.gold,
  },
  assetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tokenCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenGlyph: {
    fontFamily: mono.bold,
    fontSize: 18,
  },
  assetSymbol: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  assetName: {
    ...type.caption,
    color: colors.textMuted,
  },
  assetRight: {
    alignItems: 'flex-end',
  },
  assetBalance: {
    fontFamily: mono.semiBold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  assetUsd: {
    ...type.caption,
    color: colors.textMuted,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityMid: {
    flex: 1,
  },
  activityTitle: {
    ...type.subheading,
    fontSize: 15,
    color: colors.textPrimary,
  },
  activityTime: {
    ...type.caption,
    color: colors.textMuted,
  },
  activityAmount: {
    fontFamily: mono.semiBold,
    fontSize: 15,
    color: colors.success,
  },
  activityAmountNeg: {
    color: colors.danger,
  },
});
