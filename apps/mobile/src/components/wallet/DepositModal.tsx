import Clipboard from '@react-native-clipboard/clipboard';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../../theme/colors';
import { mono, type } from '../../theme/typography';
import type { Chain } from '../../wallet/chains';
import Icon from '../Icon';
import { BottomSheet, Button } from '../ui';

type Props = {
  visible: boolean;
  onClose: () => void;
  chain: Chain;
  address: string;
};

/** Direct card/bank deposits aren't wired up — points the user at their address. */
export default function DepositModal({ visible, onClose, chain, address }: Props) {
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
    <BottomSheet visible={visible} onClose={handleClose} title="Deposit">
      <View style={styles.iconWrap}>
        <Icon type="banknote" color={colors.accent} size={26} />
      </View>

      <Text style={styles.heading}>Direct deposits aren&apos;t supported yet</Text>
      <Text style={styles.body}>
        To add funds, send crypto straight to your wallet address on{' '}
        {chain.network}.
      </Text>

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

      <Button label="Got it" onPress={handleClose} style={styles.button} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heading: {
    ...type.heading,
    fontSize: 18,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
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
  button: {
    marginTop: spacing.lg,
  },
});
