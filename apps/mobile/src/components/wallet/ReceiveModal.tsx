import Clipboard from '@react-native-clipboard/clipboard';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { colors, radius, spacing } from '../../theme/colors';
import { mono, type } from '../../theme/typography';
import type { Chain } from '../../wallet/chains';
import BrandIcon from '../BrandIcon';
import Icon from '../Icon';
import { BottomSheet } from '../ui';

type Props = {
  visible: boolean;
  onClose: () => void;
  chain: Chain;
  address: string;
};

/** Shows the wallet address as a QR code with a copy affordance. */
export default function ReceiveModal({ visible, onClose, chain, address }: Props) {
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
    <BottomSheet visible={visible} onClose={handleClose} title="Receive">
      <View style={styles.networkRow}>
        <BrandIcon type={chain.icon} size={18} />
        <Text style={styles.networkText}>{chain.network}</Text>
      </View>

      <View style={styles.qrCard}>
        <QRCode value={address} size={200} backgroundColor="#ffffff" color="#0A0A0C" />
      </View>

      <Text style={styles.caption}>Scan to send funds to your wallet</Text>

      <Pressable
        onPress={handleCopy}
        style={({ pressed }) => [styles.addressRow, pressed && styles.pressed]}
      >
        <Text style={styles.address} numberOfLines={1} ellipsizeMode="middle">
          {address}
        </Text>
        <Icon
          type={copied ? 'check' : 'copy'}
          color={copied ? colors.success : colors.textSecondary}
          size={18}
        />
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  networkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  networkText: {
    ...type.subheading,
    color: colors.textSecondary,
  },
  qrCard: {
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  caption: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  address: {
    flex: 1,
    fontFamily: mono.medium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.7,
  },
});
