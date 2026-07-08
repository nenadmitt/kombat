import { Pressable, StyleSheet, Text } from 'react-native';

import Icon from '../Icon';
import { colors, radius, spacing } from '../../theme/colors';
import { mono } from '../../theme/typography';
import { truncateAddress } from '../../wallet/format-address';

type Props = {
  address: string;
  onPress?: () => void;
};

/** Rounded mono pill showing a truncated wallet address + copy affordance. */
export default function AddressPill({ address, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Copy wallet address"
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
    >
      <Text style={styles.text}>{truncateAddress(address)}</Text>
      <Icon type="copy" color={colors.textMuted} size={13} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    fontFamily: mono.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
