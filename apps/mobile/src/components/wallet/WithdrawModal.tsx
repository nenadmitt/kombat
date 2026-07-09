import Clipboard from '@react-native-clipboard/clipboard';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatUnits, parseUnits, type Hex } from 'viem';

import type { TokenBalance } from '../../store/walletBalances.store';
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

type Props = {
  visible: boolean;
  onClose: () => void;
  chain: Chain & { id: BalanceChainId };
  balances: Partial<Record<TokenSymbol, TokenBalance>>;
  /** Called after a successful send so balances can refresh. */
  onSent: () => void;
};

type Step = 'form' | 'review' | 'sent';

export default function WithdrawModal({
  visible,
  onClose,
  chain,
  balances,
  onSent,
}: Props) {
  const tokens = CHAIN_TOKENS[chain.id].filter(t => t.native || t.address);

  const [symbol, setSymbol] = useState<TokenSymbol>(tokens[0].symbol);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [resolved, setResolved] = useState<ResolvedRecipient | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = tokens.find(t => t.symbol === symbol) ?? tokens[0];
  const maxRaw = balances[token.symbol]?.raw ?? null;
  const maxAmount = maxRaw != null ? formatUnits(maxRaw, token.decimals) : '0';

  const reset = () => {
    setSymbol(tokens[0].symbol);
    setRecipient('');
    setAmount('');
    setStep('form');
    setResolved(null);
    setTxHash(null);
    setBusy(false);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
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
      const result = await resolveRecipient(recipient, chain.id);
      setResolved(result);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve recipient');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!resolved) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const hash = await sendTransfer({
        chainId: chain.id,
        token,
        to: resolved.address,
        amount: amount.trim(),
      });
      setTxHash(hash);
      setStep('sent');
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Withdrawal failed');
      setStep('form');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={handleClose} title="Withdraw">
      {step === 'form' ? (
        <>
          <Text style={styles.label}>Asset</Text>
          <View style={styles.coinRow}>
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
          <Text style={styles.available}>
            Available: {balances[token.symbol]?.formatted ?? '0.00'} {token.symbol}
          </Text>

          <Text style={styles.label}>Recipient</Text>
          <TextInput
            value={recipient}
            onChangeText={setRecipient}
            placeholder="0x… or name.eth"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />

          <Text style={styles.label}>Amount</Text>
          <View style={styles.amountRow}>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0.0"
              placeholderTextColor={colors.textFaint}
              keyboardType="decimal-pad"
              style={[styles.input, styles.amountInput]}
            />
            <Pressable
              onPress={() => setAmount(maxAmount)}
              style={styles.maxBtn}
            >
              <Text style={styles.maxText}>MAX</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label="Review"
            onPress={handleReview}
            loading={busy}
            disabled={busy}
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
            <View style={styles.summaryRow}>
              <Text style={styles.summaryKey}>To</Text>
              <Text style={styles.summaryVal}>
                {resolved.ensName ?? truncateAddress(resolved.address)}
              </Text>
            </View>
            {resolved.ensName ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Address</Text>
                <Text style={styles.summaryVal}>
                  {truncateAddress(resolved.address)}
                </Text>
              </View>
            ) : null}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryKey}>Network</Text>
              <Text style={styles.summaryVal}>{chain.network}</Text>
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

      {step === 'sent' && txHash ? (
        <>
          <View style={styles.sentIcon}>
            <Icon type="check" color={colors.success} size={30} />
          </View>
          <Text style={styles.sentTitle}>Withdrawal sent</Text>
          <Pressable
            onPress={() => Clipboard.setString(txHash)}
            style={({ pressed }) => [styles.hashRow, pressed && styles.pressed]}
          >
            <Text style={styles.hashText}>{truncateAddress(txHash)}</Text>
            <Icon type="copy" color={colors.textSecondary} size={16} />
          </Pressable>
          <Button label="Done" onPress={handleClose} style={styles.action} />
        </>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: {
    ...type.label,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  coinRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
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
  available: {
    ...type.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: mono.medium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  amountInput: {
    flex: 1,
  },
  maxBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  maxText: {
    fontFamily: mono.bold,
    fontSize: 12,
    color: colors.accentLight,
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
    gap: spacing.sm,
  },
  summaryAmount: {
    fontFamily: mono.bold,
    fontSize: 28,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  sentIcon: {
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  sentTitle: {
    ...type.heading,
    fontSize: 18,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  hashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  hashText: {
    fontFamily: mono.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  pressed: {
    opacity: 0.7,
  },
});
