import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { formatUnits, type Address, type Hex } from 'viem';

import BrandIcon from '../components/BrandIcon';
import Icon, { type IconName } from '../components/Icon';
import Sparkline from '../components/Sparkline';
import { Card, Screen, SectionLabel } from '../components/ui';
import ChainSelector from '../components/wallet/ChainSelector';
import DepositModal from '../components/wallet/DepositModal';
import ReceiveModal from '../components/wallet/ReceiveModal';
import TransactionModal from '../components/wallet/TransactionModal';
import WithdrawModal from '../components/wallet/WithdrawModal';
import { useCurrentUserStore } from '../store/currentUser.store';
import { useTransactionsStore, type WalletTx } from '../store/transactions.store';
import {
  MANUAL_REFRESH_COOLDOWN_MS,
  totalUsd,
  useWalletBalancesStore,
} from '../store/walletBalances.store';
import { colors, radius, spacing } from '../theme/colors';
import { mono, type } from '../theme/typography';
import { CHAINS, DEFAULT_CHAIN_ID, type ChainId } from '../wallet/chains';
import {
  MOCK_BALANCE_SPARK,
  MOCK_TRENDS,
  MOCK_WEEK_CHANGE,
} from '../wallet/market-mock';
import { CHAIN_TOKENS, supportsBalances } from '../wallet/tokens';

const REFRESH_INTERVAL_MS = 60_000;

/** Stable empty reference so the tx selector doesn't churn renders. */
const EMPTY_TXS: WalletTx[] = [];

const ACTIONS = [
  { key: 'receive', label: 'Receive', icon: 'arrow-down' as IconName },
  { key: 'deposit', label: 'Deposit', icon: 'plus' as IconName },
  { key: 'withdraw', label: 'Withdraw', icon: 'arrow-up' as IconName },
] as const;

const TX_STATUS_BADGE: Record<
  WalletTx['status'],
  { label: string; tint: string; soft: string }
> = {
  pending: { label: 'PENDING', tint: colors.accentLight, soft: colors.accentSoft },
  success: { label: 'DONE', tint: colors.success, soft: colors.successSoft },
  failed: { label: 'FAILED', tint: colors.danger, soft: colors.dangerSoft },
};

export default function WalletScreen() {
  const wallet = useCurrentUserStore(state => state.wallet);
  const [chainId, setChainId] = useState<ChainId>(DEFAULT_CHAIN_ID);
  const [coolingDown, setCoolingDown] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);
  const [openModal, setOpenModal] = useState<
    'receive' | 'deposit' | 'withdraw' | null
  >(null);
  const [activeTxHash, setActiveTxHash] = useState<Hex | null>(null);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useWalletBalancesStore(state => state.refresh);
  const chainState = useWalletBalancesStore(state =>
    supportsBalances(chainId) ? state.byChain[chainId] : undefined,
  );
  const chainTxs = useTransactionsStore(state =>
    supportsBalances(chainId) ? state.byChain[chainId] : undefined,
  );
  const txs = chainTxs ?? EMPTY_TXS;
  const track = useTransactionsStore(state => state.track);

  const activeChain = CHAINS.find(c => c.id === chainId) ?? CHAINS[0];
  const address = wallet?.address as Address | undefined;
  const canRead = supportsBalances(chainId) && !!address;
  const isLoading = chainState?.status === 'loading';
  const ethUsdPrice = chainState?.ethUsdPrice ?? null;

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
    ? totalUsd(chainId, balances, ethUsdPrice)
    : '$0.00';
  const [totalWhole, totalCents = '00'] = total.split('.');

  // USD-weighted allocation (priced tokens only) for the segmented bar.
  const allocation = tokens.map(token => {
    const raw = balances[token.symbol]?.raw;
    let usd = 0;
    if (raw != null) {
      if (token.stable) {
        usd = Number(formatUnits(raw, token.decimals));
      } else if (token.native && ethUsdPrice != null) {
        usd = Number(formatUnits(raw, token.decimals)) * Number(formatUnits(ethUsdPrice, 8));
      }
    }
    return { symbol: token.symbol, tint: token.tint, usd };
  });
  const allocTotal = allocation.reduce((sum, a) => sum + a.usd, 0);

  const activeTx = txs.find(t => t.hash === activeTxHash) ?? null;

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
        <View style={styles.balanceTop}>
          <Pressable
            onPress={() => setHideBalance(v => !v)}
            hitSlop={8}
            style={styles.balanceLabelRow}
          >
            <Text style={[type.label, styles.balanceLabel]}>Total balance</Text>
            <Icon
              type={hideBalance ? 'eye-off' : 'eye'}
              color="rgba(10,10,12,0.55)"
              size={15}
            />
          </Pressable>
          <View style={styles.growthPill}>
            <Icon type="trending-up" color={colors.onAccent} size={12} />
            <Text style={styles.growthText}>{MOCK_WEEK_CHANGE.pct}</Text>
          </View>
        </View>

        <Text style={styles.balanceValue}>
          {hideBalance ? (
            '••••••'
          ) : (
            <>
              {totalWhole}
              <Text style={styles.balanceCents}>.{totalCents}</Text>
            </>
          )}
        </Text>
        <Text style={styles.weekChange}>{MOCK_WEEK_CHANGE.abs} this week</Text>

        <View style={styles.sparkOverlay} pointerEvents="none">
          <Sparkline points={MOCK_BALANCE_SPARK} color="rgba(10,10,12,0.55)" width={100} height={34} />
        </View>

        <View style={styles.allocBar}>
          {allocTotal > 0 ? (
            allocation
              .filter(a => a.usd > 0)
              .map(a => (
                <View
                  key={a.symbol}
                  style={{ flex: a.usd, backgroundColor: a.tint, marginRight: 2 }}
                />
              ))
          ) : (
            <View style={styles.allocEmpty} />
          )}
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
          <View style={styles.assetsHeaderRight}>
            <Text style={styles.tokenCount}>{tokens.length} tokens</Text>
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
            const trend = MOCK_TRENDS[token.symbol];
            const trendColor = trend.up ? colors.success : colors.danger;
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
                    <View style={[styles.tokenCircle, { backgroundColor: token.tint, borderColor: token.tint }]}>
                      <Text style={[styles.tokenGlyph, { color: colors.onAccent }]}>{token.glyph}</Text>
                    </View>
                  )}
                  <View>
                    <View style={styles.assetSymbolRow}>
                      <Text style={styles.assetSymbol}>{token.symbol}</Text>
                      <View style={[styles.trendBadge, { backgroundColor: trend.up ? colors.successSoft : colors.dangerSoft }]}>
                        <Text style={[styles.trendText, { color: trendColor }]}>{trend.pct}</Text>
                      </View>
                    </View>
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
        <SectionLabel>Recent activity</SectionLabel>
        {txs.length === 0 ? (
          <Text style={styles.emptyActivityText}>No recent activity yet</Text>
        ) : (
          <View style={styles.list}>
            {txs.map(tx => {
            const badge = TX_STATUS_BADGE[tx.status];
            const subtitle =
              tx.status === 'pending'
                ? `Tap to track · ${tx.confirmations} of ${tx.requiredConfirmations} confirmations`
                : tx.status === 'success'
                  ? 'Completed'
                  : 'Failed';
            return (
              <Pressable
                key={tx.hash}
                onPress={() => setActiveTxHash(tx.hash)}
                style={({ pressed }) => [
                  styles.txRow,
                  tx.status === 'pending' && styles.txRowPending,
                  pressed && styles.refreshPressed,
                ]}
              >
                <View style={styles.txIcon}>
                  <Icon type="timer" color={colors.accentLight} size={18} />
                </View>
                <View style={styles.activityMid}>
                  <View style={styles.txTitleRow}>
                    <Text style={styles.activityTitle}>
                      Withdraw {tx.tokenSymbol}
                    </Text>
                    <View style={[styles.txBadge, { backgroundColor: badge.soft }]}>
                      <Text style={[styles.txBadgeText, { color: badge.tint }]}>
                        {badge.label}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.activityTime}>{subtitle}</Text>
                </View>
                <Text style={[styles.activityAmount, styles.activityAmountNeg]}>
                  -{tx.amount}
                </Text>
              </Pressable>
            );
            })}
          </View>
        )}
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
              ethUsdPrice={ethUsdPrice}
              onSubmitted={submitted => {
                setOpenModal(null);
                track({
                  hash: submitted.hash,
                  chainId,
                  tokenSymbol: submitted.tokenSymbol,
                  amount: submitted.amount,
                  to: submitted.to,
                  toLabel: submitted.toLabel,
                });
                setActiveTxHash(submitted.hash);
                refresh(chainId, address);
              }}
            />
          ) : null}
          <TransactionModal
            visible={activeTxHash != null}
            onClose={() => setActiveTxHash(null)}
            tx={activeTx}
          />
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
    gap: spacing.xs,
    overflow: 'hidden',
  },
  balanceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  balanceLabel: {
    color: 'rgba(10, 10, 12, 0.6)',
  },
  growthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    backgroundColor: 'rgba(10, 10, 12, 0.18)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  growthText: {
    fontFamily: mono.bold,
    fontSize: 12,
    color: colors.onAccent,
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
  weekChange: {
    fontFamily: mono.medium,
    fontSize: 12,
    color: 'rgba(10, 10, 12, 0.6)',
  },
  sparkOverlay: {
    position: 'absolute',
    right: spacing.lg,
    top: 64,
    opacity: 0.9,
  },
  allocBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(10,10,12,0.22)',
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  allocEmpty: {
    flex: 1,
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
  assetsHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tokenCount: {
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
  assetSymbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  assetSymbol: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  trendBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  trendText: {
    fontFamily: mono.semiBold,
    fontSize: 10,
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
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  txRowPending: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  txBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  txBadgeText: {
    fontFamily: mono.bold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  emptyActivityText: {
    ...type.caption,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
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
