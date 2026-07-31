import {
  STAKE_ASSET_DECIMALS,
  StakeAsset,
  formatStakeAmount,
  type StakePotBalances,
} from '@gaming-platform/core';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatUnits } from 'viem';

import { colors, radius, spacing } from '../../theme/colors';
import { mono, type } from '../../theme/typography';
import { CHAINS } from '../../wallet/chains';
import { POT_ASSETS } from '../../wallet/stake-pot-assets';
import {
  CHAIN_TOKENS,
  ETH_USD_FEED_DECIMALS,
  type BalanceChainId,
} from '../../wallet/tokens';
import BrandIcon from '../BrandIcon';
import Icon from '../Icon';
import { Button } from '../ui';
import CoinJar from './CoinJar';

/** Token mark in a pot row - one size, matching the wallet tab's rows. */
const ICON_TILE = 40;

type Props = {
  chainId: BalanceChainId;
  pot: StakePotBalances;
  /** Chainlink ETH/USD answer, used to price the pot's native balance. */
  ethUsdPrice: bigint | null;
  error: string | null;
  onAdd: () => void;
  onWithdraw: () => void;
};

/**
 * The stake pot tab: what the player can stake right now, what is tied up in
 * live matches, and what is on its way back out.
 *
 * This is a different balance from the wallet tab's on-chain one - pot funds
 * sit in the StakePot contract, not in the user's wallet - so the two live on
 * separate tabs and the pot carries gold rather than the app accent.
 */
export default function StakePotTab({
  chainId,
  pot,
  ethUsdPrice,
  error,
  onAdd,
  onWithdraw,
}: Props) {
  const network = CHAINS.find(c => c.id === chainId)?.network ?? chainId;

  // Every token the wallet shows gets a row, so the two tabs list the same
  // currencies. One the pot cannot hold on this network stays visible and
  // says why, rather than silently going missing.
  const rows = CHAIN_TOKENS[chainId].map(token => {
    const asset = POT_ASSETS.find(a => a.symbol === token.symbol)?.asset;
    const stakeable = asset !== undefined && (token.native || !!token.address);
    return {
      token,
      asset,
      stakeable,
      available: asset !== undefined ? BigInt(pot.available[asset]) : 0n,
      locked: asset !== undefined ? BigInt(pot.locked[asset]) : 0n,
      pending: asset !== undefined ? BigInt(pot.pendingWithdrawals[asset]) : 0n,
    };
  });

  const stakeable = rows.filter(row => row.stakeable);
  const canWithdraw = stakeable.some(row => row.available > 0n);
  const funded = stakeable.filter(
    row => row.available > 0n || row.locked > 0n || row.pending > 0n,
  ).length;

  const lockedUsd = stakeable.reduce(
    (sum, row) => sum + usdValue(row.asset!, row.locked, ethUsdPrice),
    0,
  );
  const [whole, cents] = splitUsd(
    stakeable.reduce(
      (sum, row) => sum + usdValue(row.asset!, row.available, ethUsdPrice),
      0,
    ),
  );

  return (
    <View style={styles.tab}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={styles.scrollBody}
      >
        <View style={styles.hero}>
          <View style={styles.heroLeft}>
            <View style={styles.heroLabelRow}>
              <Icon type="coins" color={colors.gold} size={14} />
              <Text style={styles.heroLabel}>In the pot</Text>
            </View>
            <Text style={styles.heroValue}>
              {whole}
              <Text style={styles.heroCents}>.{cents}</Text>
            </Text>
            <Text style={styles.heroNote}>
              {lockedUsd > 0
                ? `Staked funds - $${lockedUsd.toFixed(2)} is in play right now.`
                : 'Staked funds - join a match with no transaction.'}
            </Text>
          </View>
          <CoinJar width={112} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.listHead}>
          <Text style={styles.listLabel}>Currencies</Text>
          <Text style={styles.listCount}>
            {funded} of {stakeable.length} staked
          </Text>
        </View>

        <View>
          {rows.map((row, index) => {
            const asset = row.asset;
            const dimmed =
              !row.stakeable || (row.available === 0n && row.locked === 0n);
            return (
              <View
                key={row.token.symbol}
                style={[styles.row, index < rows.length - 1 && styles.rowRule]}
              >
                <View style={[styles.rowIcon, dimmed && styles.dim]}>
                  {row.token.brand ? (
                    <BrandIcon type={row.token.brand} size={ICON_TILE} />
                  ) : (
                    <View style={styles.rowGlyphCircle}>
                      <Text style={styles.rowGlyph}>
                        {row.token.glyph ?? '◆'}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.rowMid}>
                  <Text style={[styles.rowSymbol, dimmed && styles.dimText]}>
                    {row.token.symbol}
                  </Text>
                  <Text style={styles.rowName}>
                    {row.stakeable
                      ? row.token.name
                      : `Disabled on ${network}`}
                  </Text>
                </View>
                {row.stakeable && asset !== undefined ? (
                  <View style={styles.rowRight}>
                    <Text style={[styles.rowAmount, dimmed && styles.rowAmountEmpty]}>
                      {formatStakeAmount(row.available.toString(), asset)}
                    </Text>
                    <Text style={styles.rowNote}>
                      {row.locked > 0n
                        ? `${formatStakeAmount(row.locked.toString(), asset)} in play`
                        : row.pending > 0n
                          ? `${formatStakeAmount(row.pending.toString(), asset)} withdrawing`
                          : usdLabel(asset, row.available, ethUsdPrice)}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.disabledTag}>Unavailable</Text>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <Button
          label="Stake"
          icon="plus"
          variant="gold"
          onPress={onAdd}
          style={styles.addAction}
        />
        <Button
          label="Withdraw"
          icon="arrow-up"
          variant="goldOutline"
          onPress={onWithdraw}
          disabled={!canWithdraw}
          style={styles.action}
        />
      </View>
    </View>
  );
}

/** USD for a pot balance. KOMBAT has no price feed, so it counts as zero. */
function usdValue(
  asset: StakeAsset,
  raw: bigint,
  ethUsdPrice: bigint | null,
): number {
  const amount = Number(formatUnits(raw, STAKE_ASSET_DECIMALS[asset]));
  if (asset === StakeAsset.Usdc) {
    return amount;
  }
  if (asset === StakeAsset.Native && ethUsdPrice != null) {
    return amount * Number(formatUnits(ethUsdPrice, ETH_USD_FEED_DECIMALS));
  }
  return 0;
}

/** Per-row USD, or the bare symbol when that token has no price feed. */
function usdLabel(
  asset: StakeAsset,
  raw: bigint,
  ethUsdPrice: bigint | null,
): string {
  if (asset === StakeAsset.Kombat) {
    return 'KOMBAT';
  }
  return `$${usdValue(asset, raw, ethUsdPrice).toFixed(2)}`;
}

function splitUsd(total: number): [string, string] {
  const [intPart, fracPart = '00'] = total.toFixed(2).split('.');
  return [`$${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`, fracPart];
}

const styles = StyleSheet.create({
  tab: {
    flex: 1,
  },
  scrollBody: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroLeft: {
    flex: 1,
    gap: spacing.xs,
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  heroLabel: {
    ...type.label,
    color: colors.gold,
  },
  heroValue: {
    fontFamily: mono.bold,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1,
    color: colors.gold,
  },
  heroCents: {
    fontSize: 22,
  },
  heroNote: {
    ...type.caption,
    color: colors.textMuted,
  },
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listLabel: {
    ...type.label,
    color: colors.textMuted,
  },
  listCount: {
    ...type.label,
    color: colors.textMuted,
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
  rowIcon: {
    width: ICON_TILE,
    height: ICON_TILE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: {
    opacity: 0.45,
  },
  dimText: {
    color: colors.textMuted,
  },
  rowGlyphCircle: {
    width: ICON_TILE,
    height: ICON_TILE,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowGlyph: {
    fontFamily: mono.bold,
    fontSize: 18,
    color: colors.onAccent,
  },
  rowMid: {
    flex: 1,
    gap: spacing.xxs,
  },
  rowSymbol: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  rowName: {
    ...type.caption,
    color: colors.textMuted,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: spacing.xxs,
  },
  rowAmount: {
    fontFamily: mono.bold,
    fontSize: 18,
    color: colors.gold,
  },
  rowAmountEmpty: {
    color: colors.textMuted,
  },
  rowNote: {
    ...type.caption,
    color: colors.textMuted,
  },
  disabledTag: {
    ...type.caption,
    color: colors.textFaint,
  },
  error: {
    ...type.caption,
    color: colors.danger,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  addAction: {
    flex: 1.4,
  },
  action: {
    flex: 1,
  },
});
