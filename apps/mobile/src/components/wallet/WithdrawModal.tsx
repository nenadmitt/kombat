import Clipboard from '@react-native-clipboard/clipboard';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatUnits, parseUnits, type Address, type Hex } from 'viem';

import { useCurrentUserStore } from '../../store/currentUser.store';
import type { TokenBalance } from '../../store/walletBalances.store';
import { colors, radius, spacing } from '../../theme/colors';
import { mono, type } from '../../theme/typography';
import type { Chain } from '../../wallet/chains';
import { resolveRecipient, type ResolvedRecipient } from '../../wallet/ens';
import { truncateAddress } from '../../wallet/format-address';
import { CHAIN_TOKENS, type BalanceChainId, type TokenSymbol } from '../../wallet/tokens';
import { sendTransfer } from '../../wallet/transfer';
import { describeTransferError } from '../../wallet/transfer-error';
import BrandIcon from '../BrandIcon';
import Icon from '../Icon';
import { BottomSheet, Button, Card, useKeyboardDoneId } from '../ui';

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
  onSubmitted: (tx: SubmittedTx) => void;
};

const QUICK_FRACTIONS = [0.25, 0.5, 0.75, 1] as const;

function trimAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }
  return value.toFixed(value >= 1 ? 2 : 6).replace(/\.?0+$/, '');
}

export default function WithdrawModal({
  visible,
  onClose,
  chain,
  balances,
  ethUsdPrice,
  onSubmitted,
}: Props) {
  const doneId = useKeyboardDoneId();
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
  const userId = useCurrentUserStore(state => state.userId);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [activeFraction, setActiveFraction] = useState<number | null>(null);
  const [tokenPickerOpen, setTokenPickerOpen] = useState(false);
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
  // A failed balanceOf and a real zero both arrive as null; signing against an unknown balance reverts, so unknown blocks too.
  const balanceUnknown = maxRaw == null;
  const exceedsBalance = amountWei != null && maxRaw != null && amountWei > maxRaw;
  const cannotSend = exceedsBalance || balanceUnknown;

  const usdApprox = (() => {
    const num = Number(amount);
    if (!num) return '$0.00';
    if (token.stable) return `$${num.toFixed(2)}`;
    if (token.native && ethUsdPrice != null) {
      return `$${(num * Number(formatUnits(ethUsdPrice, 8))).toFixed(2)}`;
    }
    return '$-';
  })();

  const reset = () => {
    setSymbol(tokens[0].symbol);
    setRecipient('');
    setAmount('');
    setActiveFraction(null);
    setTokenPickerOpen(false);
    setStep('form');
    setResolved(null);
    setBusy(false);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const editAmount = (next: string) => {
    setAmount(next);
    setActiveFraction(null);
  };

  const applyFraction = (fraction: number) => {
    if (maxRaw == null) return;
    setActiveFraction(fraction);
    setAmount(fraction === 1 ? maxAmount : trimAmount(Number(maxAmount) * fraction));
  };

  const pickToken = (sym: TokenSymbol) => {
    setSymbol(sym);
    setAmount('');
    setActiveFraction(null);
    setTokenPickerOpen(false);
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
    if (!userId) {
      setError('Your session is still loading. Try again in a moment.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const hash = await sendTransfer({
        userId,
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
      setError(describeTransferError(err, token.symbol));
      setStep('form');
    } finally {
      setBusy(false);
    }
  };

  const tokenGlyph = (t: (typeof tokens)[number], size: number) =>
    t.brand ? (
      <BrandIcon type={t.brand} size={size} />
    ) : (
      <Text style={[styles.glyph, { color: t.tint, fontSize: size }]}>{t.glyph}</Text>
    );

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="Withdraw"
      showClose
      gap={spacing.md}
    >
      {step === 'form' ? (
        <>
          <Card accent style={[styles.amountCard, cannotSend && styles.amountCardError]}>
            <View style={styles.amountTop}>
              <Text style={[type.label, styles.amountLabel]}>Amount</Text>
              <Text style={styles.balText}>
                Bal <Text style={styles.balValue}>{balances[token.symbol]?.formatted ?? 'unavailable'}</Text> {token.symbol}
              </Text>
            </View>

            <View style={styles.amountRow}>
              <TextInput
                value={amount}
                onChangeText={editAmount}
                placeholder="0.00"
                placeholderTextColor={colors.textFaint}
                keyboardType="decimal-pad"
                inputAccessoryViewID={doneId}
                selectionColor={colors.accent}
                cursorColor={colors.accent}
                style={styles.amountInput}
              />
              <Pressable
                onPress={() => setTokenPickerOpen(o => !o)}
                style={styles.tokenPill}
              >
                {tokenGlyph(token, 20)}
                <Text style={styles.tokenPillText}>{token.symbol}</Text>
                <Icon type="chevron-down" color={colors.textSecondary} size={16} />
              </Pressable>
            </View>
            <Text style={styles.amountUsd}>≈ {usdApprox} USD</Text>

            <View style={styles.fractionRow}>
              {QUICK_FRACTIONS.map(fraction => {
                const active = activeFraction === fraction;
                return (
                  <Pressable
                    key={fraction}
                    onPress={() => applyFraction(fraction)}
                    style={[styles.fractionBtn, active && styles.fractionBtnActive]}
                  >
                    <Text style={[styles.fractionText, active && styles.fractionTextActive]}>
                      {fraction === 1 ? 'MAX' : `${fraction * 100}%`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {tokenPickerOpen ? (
            <View style={styles.tokenList}>
              {tokens.map(t => (
                <Pressable
                  key={t.symbol}
                  onPress={() => pickToken(t.symbol)}
                  style={[styles.tokenRow, t.symbol === symbol && styles.tokenRowActive]}
                >
                  {tokenGlyph(t, 22)}
                  <Text style={styles.tokenRowSymbol}>{t.symbol}</Text>
                  <Text style={styles.tokenRowBal}>
                    {balances[t.symbol]?.formatted ?? '0.00'}
                  </Text>
                  {t.symbol === symbol ? (
                    <Icon type="check" color={colors.accent} size={18} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={[type.label, styles.fieldLabel]}>Send to</Text>
            <View style={styles.recipientRow}>
              <Icon type="user" color={colors.textMuted} size={18} />
              <TextInput
                value={recipient}
                onChangeText={setRecipient}
                placeholder="Address or ENS name"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                selectionColor={colors.accent}
                style={styles.recipientInput}
              />
              <Pressable onPress={handlePaste} hitSlop={6} style={styles.recipientBtn}>
                <Icon type="copy" color={colors.textSecondary} size={16} />
              </Pressable>
            </View>
          </View>

          <View style={styles.summary}>
            <View style={styles.summaryLine}>
              <View style={styles.summaryKeyRow}>
                <Icon type="grid" color={colors.textMuted} size={14} />
                <Text style={styles.summaryKey}>Network</Text>
              </View>
              <Text style={styles.summaryVal}>{chain.network}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryLine}>
              <Text style={[type.label, styles.receiveKey]}>They receive</Text>
              <Text style={styles.receiveVal}>
                {amount || '0.00'} {token.symbol}
              </Text>
            </View>
          </View>

          {error ? (
            <Pressable
              style={styles.errorRow}
              onPress={() => setError(null)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss error"
            >
              <Text style={styles.error}>{error}</Text>
              <Icon type="close" color={colors.danger} size={16} />
            </Pressable>
          ) : null}

          {balanceUnknown ? (
            <Text style={styles.blockedNote}>
              Could not read your {token.symbol} balance, so withdrawing is off
              until it loads. Pull to refresh on the wallet tab.
            </Text>
          ) : null}

          <Button
            label="Review withdrawal"
            trailingIcon="arrow-right"
            onPress={handleReview}
            loading={busy}
            disabled={busy || cannotSend}
          />
        </>
      ) : null}

      {step === 'review' && resolved ? (
        <>
          <Card accent style={styles.reviewCard}>
            <Text style={styles.reviewAmount}>
              {amount} {token.symbol}
            </Text>
            <Text style={styles.amountUsd}>≈ {usdApprox} USD</Text>
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
          </Card>

          {error ? (
            <Pressable
              style={styles.errorRow}
              onPress={() => setError(null)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss error"
            >
              <Text style={styles.error}>{error}</Text>
              <Icon type="close" color={colors.danger} size={16} />
            </Pressable>
          ) : null}

          <Button
            label="Confirm withdrawal"
            onPress={handleConfirm}
            loading={busy}
            disabled={busy}
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
    color: colors.accentLight,
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
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: radius.pill,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: 7,
  },
  tokenPillText: {
    fontFamily: mono.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  glyph: {
    fontFamily: mono.bold,
  },
  amountUsd: {
    ...type.caption,
    color: colors.textMuted,
  },
  fractionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  fractionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  fractionBtnActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  fractionText: {
    fontFamily: mono.bold,
    fontSize: 12,
    color: colors.textSecondary,
  },
  fractionTextActive: {
    color: colors.accentLight,
  },
  tokenList: {
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  tokenRowActive: {
    backgroundColor: colors.accentSoft,
  },
  tokenRowSymbol: {
    flex: 1,
    fontFamily: mono.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  tokenRowBal: {
    fontFamily: mono.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.textMuted,
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 52,
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
  summary: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  summaryLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryKey: {
    ...type.body,
    fontSize: 14,
    color: colors.textSecondary,
  },
  summaryVal: {
    fontFamily: mono.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  receiveKey: {
    color: colors.textMuted,
  },
  receiveVal: {
    fontFamily: mono.bold,
    fontSize: 15,
    color: colors.accentLight,
  },
  blockedNote: {
    ...type.caption,
    color: colors.textSecondary,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  error: {
    ...type.caption,
    flex: 1,
    color: colors.danger,
  },
  reviewCard: {
    gap: spacing.sm,
  },
  reviewAmount: {
    fontFamily: mono.bold,
    fontSize: 30,
    letterSpacing: -0.5,
    color: colors.textPrimary,
    textAlign: 'center',
  },
});
