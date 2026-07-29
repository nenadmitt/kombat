import {
  formatStakeAmount,
  type StakePotBalances,
} from '@gaming-platform/core';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../../theme/colors';
import { mono, type } from '../../theme/typography';
import { POT_ASSETS, tokenForAsset } from '../../wallet/stake-pot-assets';
import type { BalanceChainId } from '../../wallet/tokens';
import BrandIcon from '../BrandIcon';
import Icon from '../Icon';
import { Button, Card } from '../ui';

type Props = {
  chainId: BalanceChainId;
  pot: StakePotBalances;
  loading: boolean;
  error: string | null;
  onAdd: () => void;
  onWithdraw: () => void;
};

/**
 * The stake pot on the wallet screen: what the player can stake right now,
 * what is tied up in live matches, and what is on its way back out.
 *
 * This is a different balance from the wallet's on-chain one above it - pot
 * funds sit in the StakePot contract, not in the user's wallet - so the card
 * says so rather than leaving two numbers to be confused.
 */
export default function StakePotCard({
  chainId,
  pot,
  loading,
  error,
  onAdd,
  onWithdraw,
}: Props) {
  const rows = POT_ASSETS.map(({ asset }) => ({
    asset,
    token: tokenForAsset(chainId, asset),
    available: BigInt(pot.available[asset]),
    locked: BigInt(pot.locked[asset]),
    pending: BigInt(pot.pendingWithdrawals[asset]),
  })).filter(row => row.token !== undefined);

  const anyFunds = rows.some(
    row => row.available > 0n || row.locked > 0n || row.pending > 0n,
  );
  const canWithdraw = rows.some(row => row.available > 0n);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.icon}>
            <Icon type="shield" color={colors.accent} size={18} />
          </View>
          <View>
            <Text style={styles.title}>Stake pot</Text>
            <Text style={styles.subtitle}>Your balance for staked matches</Text>
          </View>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!anyFunds && !loading ? (
        <Text style={styles.empty}>
          Add funds to play staked matches. Deposit once - after that, entering a
          match costs no transaction at all.
        </Text>
      ) : (
        <View style={styles.rows}>
          {rows.map(row => (
            <View key={row.asset} style={styles.row}>
              <View style={styles.rowLeft}>
                {row.token?.brand ? (
                  <BrandIcon type={row.token.brand} size={24} />
                ) : (
                  <Text style={[styles.glyph, { color: row.token?.tint }]}>
                    {row.token?.glyph ?? '◆'}
                  </Text>
                )}
                <Text style={styles.rowSymbol}>{row.token?.symbol}</Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.rowAmount}>
                  {formatStakeAmount(row.available.toString(), row.asset)}
                </Text>
                {row.locked > 0n ? (
                  <Text style={styles.rowNote}>
                    {formatStakeAmount(row.locked.toString(), row.asset)} in play
                  </Text>
                ) : row.pending > 0n ? (
                  <Text style={styles.rowNote}>
                    {formatStakeAmount(row.pending.toString(), row.asset)}{' '}
                    withdrawing
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <Button
          label="Add funds"
          icon="plus"
          size="sm"
          onPress={onAdd}
          style={styles.action}
        />
        <Button
          label="Withdraw"
          icon="arrow-up"
          variant="secondary"
          size="sm"
          onPress={onWithdraw}
          disabled={!canWithdraw}
          style={styles.action}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  title: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  subtitle: {
    ...type.caption,
    color: colors.textMuted,
  },
  rows: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowSymbol: {
    ...type.body,
    color: colors.textSecondary,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowAmount: {
    fontFamily: mono.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  rowNote: {
    ...type.caption,
    color: colors.textMuted,
  },
  glyph: {
    fontFamily: mono.bold,
    fontSize: 20,
  },
  empty: {
    ...type.caption,
    color: colors.textMuted,
  },
  error: {
    ...type.caption,
    color: colors.danger,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
});
