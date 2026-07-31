import { StakeAsset } from '@gaming-platform/core';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Address, type Hex } from 'viem';

import Icon from '../components/Icon';
import { Screen, SectionLabel, SegmentedTabs, type SegmentedTab } from '../components/ui';
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

/** Stable empty reference so the tx selector doesn't churn renders. */
const EMPTY_TXS: WalletTx[] = [];

type TabKey = 'pot' | 'wallet';

const TABS: readonly SegmentedTab<TabKey>[] = [
  { value: 'pot', label: 'Stake pot', icon: 'shield', tint: colors.gold },
  { value: 'wallet', label: 'Wallet', icon: 'wallet' },
];

const TX_STATUS_BADGE: Record<
  WalletTx['status'],
  { label: string; tint: string; soft: string }
> = {
  pending: { label: 'PENDING', tint: colors.accentLight, soft: colors.accentSoft },
  success: { label: 'DONE', tint: colors.success, soft: colors.successSoft },
  failed: { label: 'FAILED', tint: colors.danger, soft: colors.dangerSoft },
};

/**
 * Wallet is two peer views behind one tab: the stake pot (funds in the
 * StakePot contract, gold) and the wallet proper (funds on chain, lime).
 * Both halves' overlays are owned here, and only here, so no two can ever be
 * presented at once - see apps/mobile/CLAUDE.md rule 5.
 */
export default function WalletScreen() {
  const wallet = useCurrentUserStore(state => state.wallet);
  const [tab, setTab] = useState<TabKey>('pot');
  const [chainId, setChainId] = useState<ChainId>(DEFAULT_CHAIN_ID);
  const [coolingDown, setCoolingDown] = useState(false);
  const [openModal, setOpenModal] = useState<WalletAction | null>(null);
  // Separate from openModal so the two can never both be presented; only one
  // of the two is ever non-null (see the guards on each handler).
  const [potMode, setPotMode] = useState<StakePotMode | null>(null);
  const [potAsset, setPotAsset] = useState<StakeAsset>(StakeAsset.Usdc);
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

  /** Opening a pot sheet is gated on no wallet sheet being up, and vice versa. */
  const openPot = (mode: StakePotMode, asset?: StakeAsset) => {
    if (openModal !== null) {
      return;
    }
    if (asset !== undefined) {
      setPotAsset(asset);
    }
    setPotMode(mode);
  };

  const activeTx = txs.find(t => t.hash === activeTxHash) ?? null;

  // A server without pooled staking has no pot to show, so the switcher goes
  // with it and the wallet is the only view.
  const activeTab = potUnavailable ? 'wallet' : tab;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Wallet</Text>
        {potUnavailable ? null : (
          <SegmentedTabs tabs={TABS} value={activeTab} onChange={setTab} />
        )}
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
                ? `The stake pot is not available on ${activeChain.network}. Switch network on the Wallet tab to use it.`
                : 'Your wallet is still being set up. The stake pot opens once it is ready.'}
            </Text>
          )}
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={styles.walletBody}
        >
          {wallet ? (
            <WalletAssetsTab
              address={wallet.address}
              chainId={chainId}
              onSelectChain={setChainId}
              balances={balances}
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
              onStake={potChainId ? asset => openPot('add', asset) : null}
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
              // Hand off to the Receive sheet; let this one dismiss first so
              // the two transparent Modals don't overlap (wedges iOS touches).
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
              initialAsset={potAsset}
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
                // Funds left the wallet now; the pot credit follows once the
                // server's watcher has enough confirmations and pushes it.
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
    flex: 1,
    gap: spacing.md,
    paddingTop: spacing.xs,
    // The tab bar's raised LOBBY action overhangs the content by 42px, and the
    // pot's CTAs sit on the bottom edge - without this they end up under it.
    paddingBottom: 44,
  },
  unavailable: {
    ...type.caption,
    color: colors.textMuted,
  },
  scroll: {
    flex: 1,
    // The ScrollView owns the screen's horizontal padding so its scrollbar and
    // any pressed row highlight run to the real edge.
    marginHorizontal: -spacing.lg,
  },
  walletBody: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xl,
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
    paddingHorizontal: 8,
    paddingVertical: 2,
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
