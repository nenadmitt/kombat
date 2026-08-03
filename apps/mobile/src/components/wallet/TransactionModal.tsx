import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { WalletTx } from '../../store/transactions.store';
import { colors, radius, spacing } from '../../theme/colors';
import { mono, type } from '../../theme/typography';
import { truncateAddress } from '../../wallet/format-address';
import Icon, { type IconName } from '../Icon';
import { BottomSheet, Button } from '../ui';

type Props = {
  visible: boolean;
  onClose: () => void;
  tx: WalletTx | null;
};

const STATUS_META: Record<
  WalletTx['status'],
  { icon: IconName; tint: string; soft: string; title: string; subtitle: string }
> = {
  pending: {
    icon: 'timer',
    tint: colors.accent,
    soft: colors.accentSoft,
    title: 'Withdrawal Pending',
    subtitle: 'Usually confirms in ~30 seconds',
  },
  success: {
    icon: 'check',
    tint: colors.success,
    soft: colors.successSoft,
    title: 'Withdrawal Complete',
    subtitle: 'Funds are on their way',
  },
  failed: {
    icon: 'close',
    tint: colors.danger,
    soft: colors.dangerSoft,
    title: 'Withdrawal Failed',
    subtitle: 'The transaction was reverted',
  },
  timeout: {
    icon: 'timer',
    tint: colors.gold,
    soft: colors.goldSoft,
    title: 'Status Unknown',
    subtitle: 'Could not confirm in time - check the explorer',
  },
};

export default function TransactionModal({ visible, onClose, tx }: Props) {
  if (!tx) {
    return <BottomSheet visible={visible} onClose={onClose} title="Transaction" showClose>{null}</BottomSheet>;
  }

  const meta = STATUS_META[tx.status];
  const progress = Math.min(tx.confirmations / tx.requiredConfirmations, 1);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Transaction" showClose>
      <View style={[styles.statusCard, { borderColor: meta.tint + '55' }]}>
        <View style={[styles.statusIcon, { backgroundColor: meta.soft }]}>
          <Icon type={meta.icon} color={meta.tint} size={26} />
        </View>
        <Text style={styles.statusTitle}>{meta.title}</Text>
        <Text style={styles.statusSubtitle}>{meta.subtitle}</Text>

        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress * 100}%`, backgroundColor: meta.tint },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: meta.tint }]}>
            {tx.confirmations}/{tx.requiredConfirmations}
          </Text>
        </View>
      </View>

      <View style={styles.details}>
        <Row label="Amount" value={`-${tx.amount} ${tx.tokenSymbol}`} />
        <Divider />
        <Row label="To" value={tx.toLabel ?? truncateAddress(tx.to)} />
        <Divider />
        <Divider />
        <Row label="Tx hash" value={truncateAddress(tx.hash)} accent />
      </View>

      {tx.explorerUrl ? (
        <Button
          label={`View on ${tx.explorerName}`}
          trailingIcon="arrow-right"
          variant="secondary"
          onPress={() => Linking.openURL(tx.explorerUrl)}
          style={styles.explorerBtn}
        />
      ) : null}

      {tx.status !== 'pending' ? (
        <Button label="Done" onPress={onClose} style={styles.doneBtn} />
      ) : null}
    </BottomSheet>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{label}</Text>
      <Text style={[styles.rowVal, accent && styles.rowValAccent]}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  statusCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.lg,
    alignItems: 'center',
  },
  statusIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statusTitle: {
    ...type.heading,
    fontSize: 20,
    color: colors.textPrimary,
  },
  statusSubtitle: {
    ...type.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontFamily: mono.bold,
    fontSize: 13,
  },
  details: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  rowKey: {
    ...type.body,
    fontSize: 14,
    color: colors.textMuted,
  },
  rowVal: {
    fontFamily: mono.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  rowValAccent: {
    color: colors.accentLight,
  },
  divider: {
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  explorerBtn: {
    marginTop: spacing.md,
  },
  doneBtn: {
    marginTop: spacing.sm,
  },
});
