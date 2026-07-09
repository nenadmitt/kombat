import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Address } from 'viem';

import BrandIcon from '../components/BrandIcon';
import Icon, { type IconName } from '../components/Icon';
import { Card, Screen, SectionLabel } from '../components/ui';
import ChainSelector from '../components/wallet/ChainSelector';
import DepositModal from '../components/wallet/DepositModal';
import ReceiveModal from '../components/wallet/ReceiveModal';
import WithdrawModal from '../components/wallet/WithdrawModal';
import { useCurrentUserStore } from '../store/currentUser.store';
import {
  MANUAL_REFRESH_COOLDOWN_MS,
  totalUsd,
  useWalletBalancesStore,
} from '../store/walletBalances.store';
import { colors, radius, spacing } from '../theme/colors';
import { mono, type } from '../theme/typography';
import { CHAINS, DEFAULT_CHAIN_ID, type ChainId } from '../wallet/chains';
import { CHAIN_TOKENS, supportsBalances } from '../wallet/tokens';

const REFRESH_INTERVAL_MS = 60_000;

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
  const [coolingDown, setCoolingDown] = useState(false);
  const [openModal, setOpenModal] = useState<
    'receive' | 'deposit' | 'withdraw' | null
  >(null);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useWalletBalancesStore(state => state.refresh);
  const chainState = useWalletBalancesStore(state =>
    supportsBalances(chainId) ? state.byChain[chainId] : undefined,
  );

  const activeChain = CHAINS.find(c => c.id === chainId) ?? CHAINS[0];
  const address = wallet?.address as Address | undefined;
  const canRead = supportsBalances(chainId) && !!address;
  const isLoading = chainState?.status === 'loading';

  useFocusEffect(
    useCallback(() => {
      if (!supportsBalances(chainId) || !address) {
        return;
      }
      refresh(chainId, address);
      const id = setInterval(() => refresh(chainId, address), REFRESH_INTERVAL_MS);
      return () => clearInterval(id);
    }, [chainId, address, refresh]),
  );

  useEffect(
    () => () => {
      if (cooldownTimer.current) {
        clearTimeout(cooldownTimer.current);
      }
    },
    [],
  );

  const handleRefresh = () => {
    if (!supportsBalances(chainId) || !address || isLoading || coolingDown) {
      return;
    }
    refresh(chainId, address, { manual: true });
    setCoolingDown(true);
    cooldownTimer.current = setTimeout(
      () => setCoolingDown(false),
      MANUAL_REFRESH_COOLDOWN_MS,
    );
  };

  const tokens = supportsBalances(chainId) ? CHAIN_TOKENS[chainId] : [];
  const balances = chainState?.balances ?? {};
  const total = supportsBalances(chainId)
    ? totalUsd(chainId, balances, chainState?.ethUsdPrice ?? null)
    : '$0.00';
  const [totalWhole, totalCents = '00'] = total.split('.');

  return (
    <Screen scroll>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Wallet</Text>
        {wallet ? (
          <View style={styles.headerRight}>
            <ChainSelector
              evmAddress={wallet.address}
              selected={chainId}
              onSelect={setChainId}
            />
            <Text style={styles.networkNote}>
              You&apos;re on {activeChain.network}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Balance card */}
      <View style={styles.balanceCard}>
        <Text style={[type.label, styles.balanceLabel]}>Total balance</Text>
        <Text style={styles.balanceValue}>
          {totalWhole}
          <Text style={styles.balanceCents}>.{totalCents}</Text>
        </Text>
        <View style={styles.changePill}>
          <Icon type="trending-up" color={colors.onAccent} size={13} />
          <Text style={styles.changeText}>+0.0% this week</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionRow}>
        {ACTIONS.map(action => (
          <Card
            key={action.key}
            style={styles.actionCard}
            onPress={() => setOpenModal(action.key)}
          >
            <View style={styles.actionIcon}>
              <Icon type={action.icon} color={colors.accent} size={28} />
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Card>
        ))}
      </View>

      {/* Assets */}
      <View style={styles.section}>
        <View style={styles.assetsHeader}>
          <Text style={[type.label, styles.assetsLabel]}>Assets</Text>
          <Pressable
            onPress={handleRefresh}
            disabled={!canRead || isLoading || coolingDown}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Refresh balances"
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.refreshPressed]}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.accentLight} />
            ) : (
              <Icon
                type="refresh"
                size={16}
                color={coolingDown ? colors.textFaint : colors.accentLight}
              />
            )}
          </Pressable>
        </View>

        {chainState?.status === 'error' ? (
          <Text style={styles.errorText}>
            {chainState.error ?? 'Failed to load balances'}
          </Text>
        ) : null}

        <View style={styles.list}>
          {tokens.map(token => {
            const balance = balances[token.symbol];
            const highlight = token.symbol === 'KOMBAT';
            return (
              <Card
                key={token.symbol}
                flush
                style={[styles.assetCard, highlight && styles.assetHighlight]}
              >
                <View style={styles.assetLeft}>
                  {token.brand ? (
                    <View style={styles.tokenIcon}>
                      <BrandIcon type={token.brand} size={40} />
                    </View>
                  ) : (
                    <View style={[styles.tokenCircle, { backgroundColor: token.tint + '22', borderColor: token.tint + '55' }]}>
                      <Text style={[styles.tokenGlyph, { color: token.tint }]}>{token.glyph}</Text>
                    </View>
                  )}
                  <View>
                    <Text style={styles.assetSymbol}>{token.symbol}</Text>
                    <Text style={styles.assetName}>{token.name}</Text>
                  </View>
                </View>
                <View style={styles.assetRight}>
                  <Text style={styles.assetBalance}>
                    {balance?.formatted ?? '—'}
                  </Text>
                  <Text style={styles.assetUsd}>
                    {token.stable && balance?.raw != null
                      ? `$${balance.formatted}`
                      : token.symbol}
                  </Text>
                </View>
              </Card>
            );
          })}
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

      {wallet ? (
        <>
          <ReceiveModal
            visible={openModal === 'receive'}
            onClose={() => setOpenModal(null)}
            chain={activeChain}
            address={wallet.address}
          />
          <DepositModal
            visible={openModal === 'deposit'}
            onClose={() => setOpenModal(null)}
            chain={activeChain}
            address={wallet.address}
          />
          {supportsBalances(chainId) && address ? (
            <WithdrawModal
              visible={openModal === 'withdraw'}
              onClose={() => setOpenModal(null)}
              chain={{ ...activeChain, id: chainId }}
              balances={balances}
              onSent={() => refresh(chainId, address)}
            />
          ) : null}
        </>
      ) : null}
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
  headerRight: {
    alignItems: 'flex-end',
    gap: spacing.xxs,
    paddingTop: spacing.xxs,
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
  assetsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  assetsLabel: {
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
  refreshPressed: {
    opacity: 0.6,
  },
  errorText: {
    ...type.caption,
    color: colors.danger,
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
