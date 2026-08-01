import {
  STAKE_ASSET_DECIMALS,
  StakeAsset,
  formatStakeAmount,
  parseStakeAmount,
  type StakePotBalances,
} from '@gaming-platform/core';
import { useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatUnits, type Address, type Hex } from 'viem';

import { apiClient } from '../../api/client';
import type { TokenBalance } from '../../store/walletBalances.store';
import { colors, radius, spacing } from '../../theme/colors';
import { mono, type } from '../../theme/typography';
import { POT_ASSETS, tokenForAsset } from '../../wallet/stake-pot-assets';
import { depositToStakePot } from '../../wallet/stake-pot-deposit';
import type { BalanceChainId, TokenSymbol } from '../../wallet/tokens';
import BrandIcon from '../BrandIcon';
import Icon from '../Icon';
import { BottomSheet, Button, Card, KEYBOARD_DONE_ID } from '../ui';

export type StakePotMode = 'add' | 'withdraw';

/** Top up from a browser instead of an on-device wallet balance. */
const STAKE_WEB_URL = 'https://playkombat.xyz/stake';

type Props = {
  /**
   * Null keeps the single sheet closed. One Modal with two visual states,
   * never two Modals - see apps/mobile/CLAUDE.md rule 5.
   */
  mode: StakePotMode | null;
  onClose: () => void;
  chainId: BalanceChainId;
  /** On-chain wallet balances, the ceiling when adding. */
  walletBalances: Partial<Record<TokenSymbol, TokenBalance>>;
  pot: StakePotBalances;
  /** Fired after a deposit is broadcast, so the parent can track the tx. */
  onDeposited: (tx: { hash: Hex; symbol: TokenSymbol; amount: string }) => void;
  /** Fired after a withdrawal is queued server-side. */
  onWithdrawRequested: () => void;
};

/**
 * ETH kept back so the wallet can still pay gas after a deposit. Depositing a
 * true "max" would leave the wallet unable to broadcast anything again.
 */
const NATIVE_GAS_HEADROOM = 2_000_000_000_000_000n; // 0.002 ETH

const QUICK_FRACTIONS = [0.25, 0.5, 1] as const;

export default function StakePotModal({
  mode,
  onClose,
  chainId,
  walletBalances,
  pot,
  onDeposited,
  onWithdrawRequested,
}: Props) {
  const [asset, setAsset] = useState<StakeAsset>(StakeAsset.Usdc);
  const [amount, setAmount] = useState('');
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adding = mode === 'add';
  const token = tokenForAsset(chainId, asset);

  useEffect(() => {
    if (mode === null) {
      setAmount('');
      setAssetPickerOpen(false);
      setBusy(false);
      setError(null);
      return;
    }
    // The sheet is reused across openings, so reset the picker rather than
    // reopening on whatever was chosen last time.
    setAsset(StakeAsset.Usdc);
  }, [mode]);

  /** The ceiling in base units: wallet balance when adding, pot when taking out. */
  const maxRaw = (() => {
    if (!adding) {
      return BigInt(pot.available[asset]);
    }
    if (!token) {
      return 0n;
    }
    const raw = walletBalances[token.symbol]?.raw ?? 0n;
    if (asset !== StakeAsset.Native) {
      return raw;
    }
    return raw > NATIVE_GAS_HEADROOM ? raw - NATIVE_GAS_HEADROOM : 0n;
  })();

  const amountRaw = (() => {
    if (!amount.trim()) {
      return null;
    }
    try {
      return BigInt(parseStakeAmount(amount.trim(), asset));
    } catch {
      return null;
    }
  })();
  const exceedsMax = amountRaw != null && amountRaw > maxRaw;

  const applyFraction = (fraction: number) => {
    if (maxRaw <= 0n) {
      return;
    }
    const value =
      fraction === 1
        ? maxRaw
        : (maxRaw * BigInt(Math.round(fraction * 100))) / 100n;
    setAmount(formatStakeAmount(value.toString(), asset));
  };

  const submit = async () => {
    setError(null);
    if (amountRaw == null || amountRaw <= 0n) {
      setError('Enter an amount');
      return;
    }
    if (exceedsMax) {
      setError(
        adding
          ? 'Amount exceeds your wallet balance'
          : 'Amount exceeds what you can withdraw',
      );
      return;
    }

    setBusy(true);
    try {
      if (adding) {
        if (!token) {
          setError(`${asset} isn't available on this network`);
          return;
        }
        // The pot address comes from the server so the app doesn't keep a
        // second copy of the deployment config.
        const target = await apiClient.getStakePotDepositTarget();
        const hash = await depositToStakePot({
          chainId,
          pot: target.contract as Address,
          token,
          amount: amount.trim(),
        });
        onDeposited({ hash, symbol: token.symbol, amount: amount.trim() });
      } else {
        await apiClient.withdrawFromStakePot(asset, amountRaw.toString());
        onWithdrawRequested();
      }
      setAmount('');
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : adding
            ? 'Deposit failed'
            : 'Withdrawal failed',
      );
    } finally {
      setBusy(false);
    }
  };

  const assetGlyph = (target: StakeAsset, size: number) => {
    const t = tokenForAsset(chainId, target);
    if (t?.brand) {
      return <BrandIcon type={t.brand} size={size} />;
    }
    return (
      <Text style={[styles.glyph, { color: t?.tint ?? colors.gold, fontSize: size }]}>
        {t?.glyph ?? '◆'}
      </Text>
    );
  };

  const availableLabel = (target: StakeAsset) => {
    if (!adding) {
      return formatStakeAmount(pot.available[target], target);
    }
    const t = tokenForAsset(chainId, target);
    const raw = t ? walletBalances[t.symbol]?.raw : null;
    return raw == null ? '0' : formatUnits(raw, STAKE_ASSET_DECIMALS[target]);
  };

  const locked = BigInt(pot.locked[asset]);
  const pendingOut = BigInt(pot.pendingWithdrawals[asset]);

  return (
    <BottomSheet
      visible={mode !== null}
      onClose={onClose}
      title={adding ? 'Add to stake pot' : 'Withdraw from pot'}
      subtitle={
        adding
          ? 'Deposit once, then play staked matches with no further transactions.'
          : 'Paid out to your own wallet.'
      }
      showClose
      gap={spacing.md}
    >
      <Card accent style={[styles.amountCard, exceedsMax && styles.amountCardError]}>
        <View style={styles.amountTop}>
          <Text style={[type.label, styles.amountLabel]}>Amount</Text>
          <Text style={styles.balText}>
            {adding ? 'Wallet' : 'Available'}{' '}
            <Text style={styles.balValue}>{availableLabel(asset)}</Text>
          </Text>
        </View>

        <View style={styles.amountRow}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={colors.textFaint}
            keyboardType="decimal-pad"
            inputAccessoryViewID={KEYBOARD_DONE_ID}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            style={styles.amountInput}
          />
          <Pressable
            onPress={() => setAssetPickerOpen(open => !open)}
            style={styles.tokenPill}
          >
            {assetGlyph(asset, 20)}
            <Text style={styles.tokenPillText}>
              {tokenForAsset(chainId, asset)?.symbol ?? '-'}
            </Text>
            <Icon type="chevron-down" color={colors.textSecondary} size={16} />
          </Pressable>
        </View>

        <View style={styles.fractionRow}>
          {QUICK_FRACTIONS.map(fraction => (
            <Pressable
              key={fraction}
              onPress={() => applyFraction(fraction)}
              style={styles.fractionBtn}
            >
              <Text style={styles.fractionText}>
                {fraction === 1 ? 'MAX' : `${fraction * 100}%`}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {assetPickerOpen ? (
        <View style={styles.tokenList}>
          {POT_ASSETS.map(entry => (
            <Pressable
              key={entry.asset}
              onPress={() => {
                setAsset(entry.asset);
                setAmount('');
                setAssetPickerOpen(false);
              }}
              style={[
                styles.tokenRow,
                entry.asset === asset && styles.tokenRowActive,
              ]}
            >
              {assetGlyph(entry.asset, 22)}
              <Text style={styles.tokenRowSymbol}>{entry.symbol}</Text>
              <Text style={styles.tokenRowBal}>
                {availableLabel(entry.asset)}
              </Text>
              {entry.asset === asset ? (
                <Icon type="check" color={colors.accent} size={18} />
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {!adding && locked > 0n ? (
        <Text style={styles.note}>
          {formatStakeAmount(locked.toString(), asset)} is in play and can&apos;t
          be withdrawn until those matches finish.
        </Text>
      ) : null}

      {pendingOut > 0n ? (
        <Text style={styles.note}>
          {formatStakeAmount(pendingOut.toString(), asset)} is already on its way
          to your wallet.
        </Text>
      ) : null}

      <Text style={styles.note}>
        {adding
          ? 'Credited to your pot once the deposit has enough confirmations.'
          : 'Sent from the pot to your wallet shortly after you confirm.'}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        label={adding ? 'Deposit' : 'Withdraw'}
        onPress={submit}
        loading={busy}
        disabled={busy || amountRaw == null || amountRaw <= 0n || exceedsMax}
        fullWidth
      />

      {adding ? (
        <>
          <Text style={styles.orNote}>or</Text>
          <Button
            label="Add funds on the web"
            variant="secondary"
            trailingIcon="share"
            onPress={() => {
              void Linking.openURL(STAKE_WEB_URL);
            }}
            fullWidth
          />
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  orNote: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  amountCard: {
    gap: spacing.sm,
  },
  amountCardError: {
    borderColor: colors.danger,
  },
  amountTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amountLabel: {
    color: colors.textMuted,
  },
  balText: {
    ...type.caption,
    color: colors.textMuted,
  },
  balValue: {
    fontFamily: mono.bold,
    color: colors.textPrimary,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  amountInput: {
    flex: 1,
    fontFamily: mono.bold,
    fontSize: 40,
    letterSpacing: -1,
    color: colors.textPrimary,
    padding: 0,
  },
  tokenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  tokenPillText: {
    fontFamily: mono.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  fractionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  fractionBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  fractionText: {
    ...type.caption,
    color: colors.textSecondary,
  },
  tokenList: {
    gap: spacing.xxs,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  tokenRowActive: {
    backgroundColor: colors.accentSoft,
  },
  tokenRowSymbol: {
    ...type.subheading,
    color: colors.textPrimary,
    flex: 1,
  },
  tokenRowBal: {
    fontFamily: mono.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  glyph: {
    fontFamily: mono.bold,
  },
  note: {
    ...type.caption,
    color: colors.textMuted,
  },
  error: {
    ...type.caption,
    color: colors.danger,
  },
});
