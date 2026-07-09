import Clipboard from '@react-native-clipboard/clipboard';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatUnits, parseUnits, type Address, type Hex } from 'viem';

import type { TokenBalance } from '../../store/walletBalances.store';
import { NETWORK_FEE_USD } from '../../wallet/market-mock';
import { colors, radius, spacing } from '../../theme/colors';
import { mono, type } from '../../theme/typography';
import type { Chain } from '../../wallet/chains';
import { resolveRecipient, type ResolvedRecipient } from '../../wallet/ens';
import { truncateAddress } from '../../wallet/format-address';
import { CHAIN_TOKENS, type BalanceChainId, type TokenSymbol } from '../../wallet/tokens';
import { sendTransfer } from '../../wallet/transfer';
import BrandIcon from '../BrandIcon';
import Icon from '../Icon';
import { BottomSheet, Button } from '../ui';

export type SubmittedTx = {
  hash: Hex;
  tokenSymbol: TokenSymbol;
  amount: string;
  to: Address;
  toLabel?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  chain: Chain & { id: BalanceChainId };
  balances: Partial<Record<TokenSymbol, TokenBalance>>;
  ethUsdPrice: bigint | null;
  /** Fired once the tx is broadcast; parent tracks it and opens the tx sheet. */
  onSubmitted: (tx: SubmittedTx) => void;
};

const QUICK_FRACTIONS = [0.25, 0.5, 0.75, 1] as const;

function trimAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }
  return value
    .toFixed(value >= 1 ? 2 : 6)
    .replace(/\.?0+$/, '');
}

export default function WithdrawModal({
  visible,
  onClose,
  chain,
  balances,
  ethUsdPrice,
  onSubmitted,
}: Props) {
  const tokens = CHAIN_TOKENS[chain.id];
  const hasFunds = (sym: TokenSymbol) => {
    const raw = balances[sym]?.raw;
    return raw != null && raw > 0n;
  };

  const [symbol, setSymbol] = useState<TokenSymbol>(
    () =>
      (
        tokens.find(t => hasFunds(t.symbol)) ??
        tokens.find(t => t.native || t.address) ??
        tokens[0]
      ).symbol,
  );
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<'form' | 'review'>('form');
  const [resolved, setResolved] = useState<ResolvedRecipient | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = tokens.find(t => t.symbol === symbol) ?? tokens[0];
  const maxRaw = balances[token.symbol]?.raw ?? null;
  const maxAmount = maxRaw != null ? formatUnits(maxRaw, token.decimals) : '0';

  const amountWei = (() => {
    if (!amount) return null;
    try {
      return parseUnits(amount, token.decimals);
    } catch {
      return null;
    }
  })();
  const exceedsBalance =
    amountWei != null && maxRaw != null && amountWei > maxRaw;

  const usdApprox = (() => {
    const num = Number(amount);
    if (!num) return '$0.00';
    if (token.stable) return `$${num.toFixed(2)}`;
    if (token.native && ethUsdPrice != null) {
      return `$${(num * Number(formatUnits(ethUsdPrice, 8))).toFixed(2)}`;
    }
    return '$—';
  })();

  const reset = () => {
    setSymbol(tokens[0].symbol);
    setRecipient('');
    setAmount('');
    setStep('form');
    setResolved(null);
    setBusy(false);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const applyFraction = (fraction: number) => {
    if (maxRaw == null) return;
    if (fraction === 1) {
      setAmount(maxAmount);
      return;
    }
    setAmount(trimAmount(Number(maxAmount) * fraction));
  };

  const handlePaste = async () => {
    const clip = await Clipboard.getString();
    if (clip) setRecipient(clip.trim());
  };

  const handleReview = async () => {
    setError(null);
    if (!recipient.trim()) {
      setError('Enter a recipient address or ENS name');
      return;
    }
    const num = Number(amount);
    if (!amount || Number.isNaN(num) || num <= 0) {
      setError('Enter an amount');
      return;
    }
    try {
      const wei = parseUnits(amount, token.decimals);
      if (maxRaw != null && wei > maxRaw) {
        setError('Amount exceeds your balance');
        return;
      }
    } catch {
      setError('Invalid amount');
      return;
    }

    setBusy(true);
    try {
      setResolved(await resolveRecipient(recipient, chain.id));
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve recipient');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!resolved) return;
    setBusy(true);
    setError(null);
    try {
      const hash = await sendTransfer({
        chainId: chain.id,
        token,
        to: resolved.address,
        amount: amount.trim(),
      });
      onSubmitted({
        hash,
        tokenSymbol: token.symbol,
        amount: amount.trim(),
        to: resolved.address,
        toLabel: resolved.ensName,
      });
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdrawal failed');
      setStep('form');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose} title="Withdraw" showClose>
      {step === 'form' ? (
        <>
          <View style={[styles.amountCard, exceedsBalance && styles.amountCardError]}>
            <View style={styles.amountRow}>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={colors.textFaint}
                keyboardType="decimal-pad"
                style={styles.amountInput}
              />
              <Text style={styles.amountSymbol}>{token.symbol}</Text>
            </View>
            <Text style={styles.amountUsd}>≈ {usdApprox} USD</Text>

            <View style={styles.fractionRow}>
              {QUICK_FRACTIONS.map(fraction => (
                <Pressable
                  key={fraction}
                  onPress={() => applyFraction(fraction)}
                  style={({ pressed }) => [styles.fractionBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.fractionText}>
                    {fraction === 1 ? 'MAX' : `${fraction * 100}%`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.coinChips}>
            {tokens.map(t => {
              const active = t.symbol === symbol;
              return (
                <Pressable
                  key={t.symbol}
                  onPress={() => setSymbol(t.symbol)}
                  style={[styles.coinChip, active && styles.coinChipActive]}
                >
                  {t.brand ? (
                    <BrandIcon type={t.brand} size={18} />
                  ) : (
                    <Text style={[styles.coinGlyph, { color: t.tint }]}>{t.glyph}</Text>
                  )}
                  <Text style={[styles.coinText, active && styles.coinTextActive]}>
                    {t.symbol}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.balText}>
            Bal {balances[token.symbol]?.formatted ?? '0.00'} {token.symbol}
          </Text>

          <View style={styles.recipientRow}>
            <Icon type="user" color={colors.textMuted} size={18} />
            <TextInput
              value={recipient}
              onChangeText={setRecipient}
              placeholder="Recipient address or name"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.recipientInput}
            />
            <Pressable onPress={handlePaste} hitSlop={6} style={styles.recipientBtn}>
              <Icon type="copy" color={colors.textSecondary} size={16} />
            </Pressable>
          </View>

          <View style={styles.feeRow}>
            <View style={styles.feeLeft}>
              <Icon type="timer" color={colors.textMuted} size={14} />
              <Text style={styles.feeLabel}>Network fee</Text>
            </View>
            <Text style={styles.feeValue}>{NETWORK_FEE_USD}</Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label="Review Withdrawal"
            onPress={handleReview}
            loading={busy}
            disabled={busy || exceedsBalance}
            style={styles.action}
          />
        </>
      ) : null}

      {step === 'review' && resolved ? (
        <>
          <View style={styles.summary}>
            <Text style={styles.summaryAmount}>
              {amount} {token.symbol}
            </Text>
            <Text style={styles.summaryUsd}>≈ {usdApprox} USD</Text>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryLine}>
              <Text style={styles.summaryKey}>To</Text>
              <Text style={styles.summaryVal}>
                {resolved.ensName ?? truncateAddress(resolved.address)}
              </Text>
            </View>
            {resolved.ensName ? (
              <View style={styles.summaryLine}>
                <Text style={styles.summaryKey}>Address</Text>
                <Text style={styles.summaryVal}>
                  {truncateAddress(resolved.address)}
                </Text>
              </View>
            ) : null}
            <View style={styles.summaryLine}>
              <Text style={styles.summaryKey}>Network</Text>
              <Text style={styles.summaryVal}>{chain.network}</Text>
            </View>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryKey}>Network fee</Text>
              <Text style={styles.summaryVal}>{NETWORK_FEE_USD}</Text>
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label="Confirm withdrawal"
            onPress={handleConfirm}
            loading={busy}
            disabled={busy}
            style={styles.action}
          />
          <Button
            label="Back"
            variant="ghost"
            size="md"
            onPress={() => setStep('form')}
            disabled={busy}
          />
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  amountCard: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  amountCardError: {
    borderColor: colors.danger,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  amountInput: {
    fontFamily: mono.bold,
    fontSize: 40,
    color: colors.textPrimary,
    padding: 0,
    minWidth: 90,
    textAlign: 'right',
  },
  amountSymbol: {
    fontFamily: mono.bold,
    fontSize: 20,
    color: colors.textMuted,
    marginBottom: 6,
  },
  amountUsd: {
    ...type.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  fractionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
    alignSelf: 'stretch',
  },
  fractionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  fractionText: {
    fontFamily: mono.bold,
    fontSize: 12,
    color: colors.textSecondary,
  },
  pressed: {
    opacity: 0.7,
  },
  coinChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  coinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  coinChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  coinGlyph: {
    fontFamily: mono.bold,
    fontSize: 15,
  },
  coinText: {
    fontFamily: mono.semiBold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  coinTextActive: {
    color: colors.textPrimary,
  },
  balText: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  recipientInput: {
    flex: 1,
    fontFamily: mono.medium,
    fontSize: 14,
    color: colors.textPrimary,
    padding: 0,
  },
  recipientBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  feeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  feeLabel: {
    ...type.caption,
    color: colors.textMuted,
  },
  feeValue: {
    fontFamily: mono.semiBold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  error: {
    ...type.caption,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  action: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  summary: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  summaryAmount: {
    fontFamily: mono.bold,
    fontSize: 28,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  summaryUsd: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: spacing.md,
  },
  summaryLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  summaryKey: {
    ...type.caption,
    color: colors.textMuted,
  },
  summaryVal: {
    fontFamily: mono.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
});
