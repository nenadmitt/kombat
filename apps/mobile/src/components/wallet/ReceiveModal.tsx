import Clipboard from '@react-native-clipboard/clipboard';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { colors, radius, spacing } from '../../theme/colors';
import { mono, type } from '../../theme/typography';
import type { Chain } from '../../wallet/chains';
import BrandIcon from '../BrandIcon';
import Icon from '../Icon';
import { BottomSheet, Button } from '../ui';

type Props = {
  visible: boolean;
  onClose: () => void;
  chain: Chain;
  address: string;
};

/** Shows the wallet address as a QR code with copy + share. */
export default function ReceiveModal({ visible, onClose, chain, address }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    Clipboard.setString(address);
    setCopied(true);
  };

  const handleShare = () => {
    void Share.share({ message: address });
  };

  const handleClose = () => {
    setCopied(false);
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="Receive"
      showClose
      gap={spacing.md}
    >
      <View style={styles.networkPill}>
        <BrandIcon type={chain.icon} size={20} />
        <Text style={styles.networkText}>{chain.network}</Text>
      </View>

      <View style={styles.qrCard}>
        <QRCode
          value={address}
          size={190}
          ecl="H"
          backgroundColor="#ffffff"
          color="#0b0c14"
        />
        <View style={styles.qrLogo}>
          <Text style={styles.qrLogoGlyph}>◆</Text>
        </View>
      </View>

      <Pressable
        onPress={handleCopy}
        style={({ pressed }) => [styles.addressBox, pressed && styles.pressed]}
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

      <View style={styles.warning}>
        <Icon type="warning" color={colors.gold} size={18} />
        <Text style={styles.warningText}>
          {chain.network} only. Assets sent on another network are lost.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          label={copied ? 'Copied' : 'Copy address'}
          icon={copied ? 'check' : 'copy'}
          onPress={handleCopy}
          style={styles.actionBtn}
        />
        <Button
          label="Share"
          icon="share"
          variant="secondary"
          onPress={handleShare}
          style={styles.actionBtn}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  networkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
  },
  networkText: {
    ...type.subheading,
    fontSize: 15,
    color: colors.textPrimary,
  },
  qrCard: {
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    padding: spacing.md,
    borderRadius: radius.lg,
    // Soft bloom behind the code (iOS).
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
  },
  qrLogo: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 44,
    height: 44,
    marginTop: -22,
    marginLeft: -22,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    borderWidth: 4,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrLogoGlyph: {
    fontFamily: mono.bold,
    fontSize: 18,
    color: colors.onAccent,
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  address: {
    flex: 1,
    fontFamily: mono.bold,
    fontSize: 14,
    letterSpacing: 0.4,
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.7,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: 'rgba(245, 184, 41, 0.28)',
  },
  warningText: {
    flex: 1,
    ...type.caption,
    color: colors.gold,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
  },
});
