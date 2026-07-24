import Clipboard from '@react-native-clipboard/clipboard';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../../theme/colors';
import { display, mono, type } from '../../theme/typography';
import type { Chain } from '../../wallet/chains';
import Icon from '../Icon';
import { BottomSheet, Button, Card } from '../ui';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Opens the Receive (QR) sheet for the same address. */
  onShowQr?: () => void;
  chain: Chain;
  address: string;
};

// Provider brand tints (not theme tokens - they're external brands).
const PROVIDERS = [
  {
    key: 'moonpay',
    badge: 'M',
    tint: '#7c5cf6',
    title: 'Buy with card',
    provider: 'MoonPay',
    detail: 'Visa, Mastercard, Apple Pay',
  },
  {
    key: 'ramp',
    badge: 'R',
    tint: '#3aa17e',
    title: 'Bank transfer',
    provider: 'Ramp',
    detail: 'SEPA & faster payments',
  },
] as const;

/** Direct card/bank deposits aren't wired up - points the user at their address. */
export default function DepositModal({
  visible,
  onClose,
  onShowQr,
  chain,
  address,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    Clipboard.setString(address);
    setCopied(true);
  };

  const handleClose = () => {
    setCopied(false);
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="Add funds"
      subtitle="One way in for now - more coming soon."
      showClose
      gap={spacing.md}
    >
      {/* The one wired-up path: transfer to your own address. */}
      <Card accent style={styles.transferCard}>
        <View style={styles.transferHead}>
          <View style={styles.transferIcon}>
            <Icon type="arrow-down" color={colors.onAccent} size={22} />
          </View>
          <View style={styles.transferText}>
            <Text style={styles.transferTitle}>Transfer from another wallet</Text>
            <Text style={styles.transferSub}>
              Send to your address on {chain.network}
            </Text>
          </View>
        </View>

        <View style={styles.addressBox}>
          <Text style={styles.address} numberOfLines={2}>
            {address}
          </Text>
          <Pressable onPress={handleCopy} hitSlop={8}>
            <Icon
              type={copied ? 'check' : 'copy'}
              color={copied ? colors.success : colors.textSecondary}
              size={18}
            />
          </Pressable>
        </View>

        <View style={styles.transferActions}>
          <Button
            label={copied ? 'Copied' : 'Copy'}
            icon={copied ? 'check' : 'copy'}
            onPress={handleCopy}
            style={styles.actionFlex}
          />
          <Button
            label="Show QR"
            icon="grid"
            variant="outline"
            onPress={onShowQr}
            style={styles.actionFlex}
          />
        </View>
      </Card>

      {/* Coming soon */}
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>Coming soon</Text>
        <View style={styles.dividerLine} />
      </View>

      {PROVIDERS.map(p => (
        <View key={p.key} style={styles.provider}>
          <View style={[styles.providerBadge, { backgroundColor: p.tint }]}>
            <Text style={styles.providerBadgeText}>{p.badge}</Text>
          </View>
          <View style={styles.providerText}>
            <Text style={styles.providerTitle}>
              {p.title} · {p.provider}
            </Text>
            <Text style={styles.providerDetail}>{p.detail}</Text>
          </View>
          <Icon type="lock" color={colors.textFaint} size={18} />
        </View>
      ))}

      <Button label="Got it" variant="secondary" onPress={handleClose} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  transferCard: {
    gap: spacing.md,
  },
  transferHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  transferIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transferText: {
    flex: 1,
    gap: spacing.xxs,
  },
  transferTitle: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  transferSub: {
    ...type.caption,
    color: colors.textSecondary,
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  address: {
    flex: 1,
    fontFamily: mono.bold,
    fontSize: 14,
    letterSpacing: 0.4,
    color: colors.textPrimary,
  },
  transferActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionFlex: {
    flex: 1,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  dividerText: {
    ...type.label,
    color: colors.textMuted,
  },
  provider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  providerBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerBadgeText: {
    fontFamily: display.bold,
    fontSize: 18,
    color: '#ffffff',
  },
  providerText: {
    flex: 1,
    gap: spacing.xxs,
  },
  providerTitle: {
    ...type.subheading,
    fontSize: 15,
    color: colors.textPrimary,
  },
  providerDetail: {
    ...type.caption,
    color: colors.textMuted,
  },
});
