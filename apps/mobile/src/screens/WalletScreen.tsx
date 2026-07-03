import { StyleSheet, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Icon, { type IconName } from '../components/Icon';
import { useCurrentUserStore } from '../store/currentUser.store';
import { truncateAddress } from '../wallet/format-address';
import { colors, radius, spacing } from '../theme/colors';
import { fonts } from '../theme/typography';

/** Mocked — no balance-fetching endpoint yet. Values match the Figma design. */
const MOCK_ASSETS = [
  { symbol: 'USDC', icon: 'banknote' as IconName, balance: '1,240.50', usd: '$1,240.50' },
  { symbol: 'USDT', icon: 'banknote' as IconName, balance: '450.00', usd: '$450.00' },
  { symbol: 'ETH', icon: null, label: 'Ξ', balance: '0.45', usd: '$1,320.12' },
  { symbol: 'KOMBAT', icon: 'gem' as IconName, balance: '12,500', usd: '$3,125.00' },
] as const;

const ACTIONS = [
  { key: 'receive', label: 'Receive', icon: 'arrow-down' as IconName },
  { key: 'deposit', label: 'Deposit', icon: 'plus' as IconName },
  { key: 'withdraw', label: 'Withdraw', icon: 'arrow-up' as IconName },
] as const;

export default function WalletScreen() {
  const wallet = useCurrentUserStore(state => state.wallet);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>My Wallet</Text>
          {wallet ? (
            // TODO: wire up copy-to-clipboard once a clipboard dependency is added.
            <Pressable style={styles.addressPill}>
              <Text style={styles.addressText}>
                {truncateAddress(wallet.address)}
              </Text>
              <Icon type="copy" color={colors.textMuted} size={14} />
            </Pressable>
          ) : null}
        </View>

        {/* Receive / Deposit / Withdraw — mocked for now */}
        <View style={styles.actionRow}>
          {ACTIONS.map(action => (
            <Pressable key={action.key} style={styles.actionButton}>
              <View style={styles.actionIconCircle}>
                <Icon type={action.icon} color={colors.textPrimary} size={18} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Assets */}
        <View style={styles.assetsSection}>
          <Text style={styles.sectionTitle}>Assets</Text>
          <View style={styles.assetsList}>
            {MOCK_ASSETS.map(asset => (
              <View
                key={asset.symbol}
                style={[
                  styles.assetCard,
                  asset.symbol === 'KOMBAT' && styles.assetCardHighlight,
                ]}
              >
                <View style={styles.assetLeft}>
                  <View
                    style={[
                      styles.assetIconCircle,
                      asset.symbol === 'KOMBAT' && styles.assetIconCircleHighlight,
                    ]}
                  >
                    {asset.icon ? (
                      <Icon type={asset.icon} color={colors.textPrimary} size={20} />
                    ) : (
                      <Text style={styles.assetIcon}>{asset.label}</Text>
                    )}
                  </View>
                  <View>
                    <Text style={styles.assetSymbol}>{asset.symbol}</Text>
                    <Text style={styles.assetSubtitle}>Platform Token</Text>
                  </View>
                </View>
                <View style={styles.assetRight}>
                  <Text style={styles.assetBalance}>{asset.balance}</Text>
                  <Text style={styles.assetUsd}>{asset.usd}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  addressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  addressText: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: 'Menlo',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.xs + 6,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    paddingVertical: spacing.sm,
  },
  actionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
  },
  assetsSection: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  assetsList: {
    gap: spacing.xs + 6,
  },
  assetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    padding: spacing.sm + 4,
  },
  assetCardHighlight: {
    borderColor: colors.kombatAccent,
  },
  assetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  assetIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assetIconCircleHighlight: {
    backgroundColor: colors.kombatAccent,
  },
  assetIcon: {
    fontSize: 20,
    color: colors.textPrimary,
  },
  assetSymbol: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  assetSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  assetRight: {
    alignItems: 'flex-end',
  },
  assetBalance: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  assetUsd: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
});
