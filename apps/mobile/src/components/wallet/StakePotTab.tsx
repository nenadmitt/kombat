import {
  STAKE_ASSET_DECIMALS,
  StakeAsset,
  formatStakeAmount,
  type StakePotBalances,
} from '@gaming-platform/core';
import { StyleSheet, Text, View } from 'react-native';
import { formatUnits } from 'viem';

import { colors, radius, spacing } from '../../theme/colors';
import { mono, type } from '../../theme/typography';
import { POT_ASSETS, tokenForAsset } from '../../wallet/stake-pot-assets';
import { ETH_USD_FEED_DECIMALS, type BalanceChainId } from '../../wallet/tokens';
import BrandIcon from '../BrandIcon';
import Glow from '../Glow';
import Icon from '../Icon';
import { Button } from '../ui';
import CoinJar from './CoinJar';

type Props = {
  chainId: BalanceChainId;
  pot: StakePotBalances;
  /** Chainlink ETH/USD answer, used to price the pot's native balance. */
  ethUsdPrice: bigint | null;
  loading: boolean;
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

  const lockedUsd = rows.reduce(
    (sum, row) => sum + usdValue(row.asset, row.locked, ethUsdPrice),
    0,
  );
  const [whole, cents] = splitUsd(
    rows.reduce(
      (sum, row) => sum + usdValue(row.asset, row.available, ethUsdPrice),
      0,
    ),
  );

  return (
    <>
      <View style={styles.hero}>
        <Glow
          size={210}
          color={colors.gold}
          opacity={0.22}
          edge={0.66}
          style={styles.heroGlow}
        />
        <View style={styles.heroLeft}>
          <View style={styles.heroLabelRow}>
            <Icon type="shield" color={colors.gold} size={13} />
            <Text style={styles.heroLabel}>Stake pot</Text>
          </View>
          <Text style={styles.heroValue}>
            {whole}
            <Text style={styles.heroCents}>.{cents}</Text>
          </Text>
          {lockedUsd > 0 ? (
            <Text style={styles.heroNote}>
              ${lockedUsd.toFixed(2)} in play right now
            </Text>
          ) : null}
        </View>
        <CoinJar width={132} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!anyFunds && !loading ? (
        <Text style={styles.empty}>
          Add funds to play staked matches. Deposit once - after that, entering a
          match costs no transaction at all.
        </Text>
      ) : (
        <View>
          {rows.map((row, index) => (
            <View
              key={row.asset}
              style={[styles.row, index < rows.length - 1 && styles.rowRule]}
            >
              {row.token?.brand ? (
                <View style={styles.rowIcon}>
                  <BrandIcon type={row.token.brand} size={34} />
                </View>
              ) : (
                <View style={styles.rowGlyphCircle}>
                  <Text style={styles.rowGlyph}>{row.token?.glyph ?? '◆'}</Text>
                </View>
              )}
              <View style={styles.rowMid}>
                <Text style={styles.rowSymbol}>{row.token?.symbol}</Text>
                <Text style={styles.rowName}>{row.token?.name}</Text>
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
          label="Add to pot"
          icon="plus"
          variant="gold"
          onPress={onAdd}
          style={styles.addAction}
        />
        <Button
          label="Cash out"
          icon="arrow-up"
          variant="goldOutline"
          onPress={onWithdraw}
          disabled={!canWithdraw}
          style={styles.action}
        />
      </View>
    </>
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

function splitUsd(total: number): [string, string] {
  const [intPart, fracPart = '00'] = total.toFixed(2).split('.');
  return [`$${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`, fracPart];
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    right: -30,
    top: -50,
  },
  heroLeft: {
    flex: 1,
    gap: spacing.sm,
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  heroLabel: {
    ...type.label,
    color: colors.gold,
  },
  heroValue: {
    fontFamily: mono.bold,
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -1,
    color: colors.gold,
  },
  heroCents: {
    fontSize: 20,
  },
  heroNote: {
    ...type.caption,
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
    borderBottomColor: colors.goldSoft,
  },
  rowIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowGlyphCircle: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowGlyph: {
    fontFamily: mono.bold,
    fontSize: 16,
    color: colors.onAccent,
  },
  rowMid: {
    flex: 1,
    gap: 5,
  },
  rowSymbol: {
    ...type.subheading,
    fontSize: 14,
    color: colors.textPrimary,
  },
  rowName: {
    ...type.caption,
    fontSize: 11,
    color: colors.textMuted,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 5,
  },
  rowAmount: {
    fontFamily: mono.bold,
    fontSize: 14,
    color: colors.gold,
  },
  rowNote: {
    ...type.caption,
    fontSize: 11,
    color: colors.textMuted,
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
    marginTop: 'auto',
  },
  addAction: {
    flex: 1.4,
  },
  action: {
    flex: 1,
  },
});
