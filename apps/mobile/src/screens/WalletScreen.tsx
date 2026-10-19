import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Address, type Hex } from 'viem';

import Icon from '../components/Icon';
import { Screen, SectionLabel, SegmentedTabs, type SegmentedTab } from '../components/ui';
import ChainSelector from '../components/wallet/ChainSelector';
import DepositModal from '../components/wallet/DepositModal';
import ReceiveModal from '../components/wallet/ReceiveModal';
import StakePotModal, {
  type StakePotMode,
} from '../components/wallet/StakePotModal';
import StakePotTab from '../components/wallet/StakePotTab';
import TransactionModal from '../components/wallet/TransactionModal';
import WalletAssetsTab, {
  type WalletAction,
} from '../components/wallet/WalletAssetsTab';
import WithdrawModal from '../components/wallet/WithdrawModal';
import { useCurrentUserStore } from '../store/currentUser.store';
import { useStakePotStore } from '../store/stakePot.store';
import { useTransactionsStore, type WalletTx } from '../store/transactions.store';
import {
  MANUAL_REFRESH_COOLDOWN_MS,
  useWalletBalancesStore,
} from '../store/walletBalances.store';
import { colors, radius, spacing } from '../theme/colors';
import { mono, type } from '../theme/typography';
import { CHAINS, DEFAULT_CHAIN_ID, type ChainId } from '../wallet/chains';
import { supportsBalances } from '../wallet/tokens';

const REFRESH_INTERVAL_MS = 60_000;

const EMPTY_TXS: WalletTx[] = [];

type TabKey = 'pot' | 'wallet';

const TABS: readonly SegmentedTab<TabKey>[] = [
  { value: 'pot', label: 'Stake Pot', icon: 'money-bag', tint: colors.gold },
  { value: 'wallet', label: 'Wallet', icon: 'wallet' },
];

const TX_STATUS_BADGE: Record<
  WalletTx['status'],
  { label: string; tint: string; soft: string }
> = {
  pending: { label: 'PENDING', tint: colors.accentLight, soft: colors.accentSoft },
  success: { label: 'DONE', tint: colors.success, soft: colors.successSoft },
  failed: { label: 'FAILED', tint: colors.danger, soft: colors.dangerSoft },
  timeout: { label: 'UNKNOWN', tint: colors.gold, soft: colors.goldSoft },
};

export default function WalletScreen() {
  const wallet = useCurrentUserStore(state => state.wallet);
  const ensName = useCurrentUserStore(state => state.ensName);
  const [tab, setTab] = useState<TabKey>('pot');
  const [chainId, setChainId] = useState<ChainId>(DEFAULT_CHAIN_ID);
  const [coolingDown, setCoolingDown] = useState(false);
  const [openModal, setOpenModal] = useState<WalletAction | null>(null);
  // Separate from openModal so the two can never both be presented.
  const [potMode, setPotMode] = useState<StakePotMode | null>(null);
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

  const pot = useStakePotStore(state => state.balances);
  const potUnavailable = useStakePotStore(state => state.unavailable);
  const potError = useStakePotStore(state => state.error);
  const refreshPot = useStakePotStore(state => state.refresh);

  const activeChain = CHAINS.find(c => c.id === chainId) ?? CHAINS[0];
  const address = wallet?.address as Address | undefined;
  const balanceChainId = supportsBalances(chainId) ? chainId : null;
  const canRead = balanceChainId !== null && !!address;
  const isLoading = chainState?.status === 'loading';
  const ethUsdPrice = chainState?.ethUsdPrice ?? null;
  const balances = chainState?.balances ?? {};
  const potChainId = potUnavailable || !address ? null : balanceChainId;

  useFocusEffect(
    useCallback(() => {
      void refreshPot();
      if (!supportsBalances(chainId) || !address) {
        return;
      }
      refresh(chainId, address);
      const id = setInterval(() => refresh(chainId, address), REFRESH_INTERVAL_MS);
      return () => clearInterval(id);
    }, [chainId, address, refresh, refreshPot]),
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
    if (!balanceChainId || !address) {
      return;
    }
    refresh(balanceChainId, address, { manual: true });
    setCoolingDown(true);
    cooldownTimer.current = setTimeout(
      () => setCoolingDown(false),
      MANUAL_REFRESH_COOLDOWN_MS,
    );
  };

  const openPot = (mode: StakePotMode) => {
    if (openModal !== null) {
      return;
    }
    setPotMode(mode);
  };

  const activeTx = txs.find(t => t.hash === activeTxHash) ?? null;

  const activeTab = potUnavailable ? 'wallet' : tab;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Pot &amp; Wallet</Text>
        {potUnavailable ? null : (
          <SegmentedTabs tabs={TABS} value={activeTab} onChange={setTab} />
        )}
        {wallet ? (
          <ChainSelector
            variant="row"
            evmAddress={wallet.address}
            selected={chainId}
            onSelect={setChainId}
          />
        ) : null}
      </View>

      {activeTab === 'pot' ? (
        <View style={styles.potBody}>
          {potChainId ? (
            <StakePotTab
              chainId={potChainId}
              pot={pot}
              ethUsdPrice={ethUsdPrice}
              error={potError}
              onAdd={() => openPot('add')}
              onWithdraw={() => openPot('withdraw')}
            />
          ) : (
            <Text style={styles.unavailable}>
              {address
                ? `The stake pot is not available on ${activeChain.network}. Pick another network above to use it.`
                : 'Your wallet is still being set up. The stake pot opens once it is ready.'}
            </Text>
          )}
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          // iOS adds the top safe-area inset to a ScrollView's content by default.
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          style={styles.scroll}
          contentContainerStyle={styles.walletBody}
        >
          {wallet ? (
            <WalletAssetsTab
              address={wallet.address}
              ensName={ensName}
              chainId={chainId}
              balances={balances}
              pot={pot}
              loading={isLoading}
              onRefresh={canRead && !isLoading && !coolingDown ? handleRefresh : null}
              error={
                chainState?.status === 'error'
                  ? (chainState.error ?? 'Failed to load balances')
                  : null
              }
              onAction={action => {
                if (potMode === null) {
                  setOpenModal(action);
                }
              }}
              onShowQr={() => {
                if (potMode === null) {
                  setOpenModal('receive');
                }
              }}
            />
          ) : null}

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
                      : tx.status === 'timeout'
                        ? 'Not confirmed - check the explorer'
                        : 'Failed';
                return (
                  <Pressable
                    key={tx.hash}
                    onPress={() => setActiveTxHash(tx.hash)}
                    style={({ pressed }) => [
                      styles.txRow,
                      tx.status === 'pending' && styles.txRowPending,
                      pressed && styles.pressed,
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
                    <Text style={styles.activityAmount}>-{tx.amount}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

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
            onShowQr={() => {
              // Let this one dismiss first: overlapping transparent Modals wedge iOS touches.
              setOpenModal(null);
              setTimeout(() => setOpenModal('receive'), 350);
            }}
            chain={activeChain}
            address={wallet.address}
          />
          {balanceChainId && address ? (
            <WithdrawModal
              visible={openModal === 'withdraw'}
              onClose={() => setOpenModal(null)}
              chain={{ ...activeChain, id: balanceChainId }}
              balances={balances}
              ethUsdPrice={ethUsdPrice}
              onSubmitted={submitted => {
                setOpenModal(null);
                track({
                  hash: submitted.hash,
                  chainId: balanceChainId,
                  tokenSymbol: submitted.tokenSymbol,
                  amount: submitted.amount,
                  to: submitted.to,
                  toLabel: submitted.toLabel,
                });
                setActiveTxHash(submitted.hash);
                refresh(balanceChainId, address);
              }}
            />
          ) : null}
          {balanceChainId && address ? (
            <StakePotModal
              mode={potMode}
              onClose={() => setPotMode(null)}
              chainId={balanceChainId}
              walletBalances={balances}
              pot={pot}
              onDeposited={submitted => {
                track({
                  hash: submitted.hash,
                  chainId: balanceChainId,
                  tokenSymbol: submitted.symbol,
                  amount: submitted.amount,
                  to: wallet.address as Address,
                  toLabel: 'Stake pot',
                });
                refresh(balanceChainId, address);
              }}
              onWithdrawRequested={() => {
                void refreshPot();
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
    gap: spacing.md,
  },
  title: {
    ...type.title,
    color: colors.textPrimary,
  },
  potBody: {
    // The tab bar's raised LOBBY action overhangs content by 42px.
    flex: 1,
    paddingBottom: spacing.xxl,
  },
  unavailable: {
    ...type.caption,
    color: colors.textMuted,
  },
  scroll: {
    flex: 1,
    // The ScrollView owns the horizontal padding so its scrollbar and row highlights run to the real edge.
    marginHorizontal: -spacing.lg,
  },
  walletBody: {
    // No paddingTop: Screen already puts one spacing.md between every block.
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  list: {
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  emptyActivityText: {
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
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  txBadgeText: {
    fontFamily: mono.bold,
    fontSize: 9,
    letterSpacing: 0.5,
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
    color: colors.danger,
  },
});
