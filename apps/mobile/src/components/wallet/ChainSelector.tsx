import Clipboard from '@react-native-clipboard/clipboard';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '../../theme/colors';
import { display, mono, type } from '../../theme/typography';
import { addressForChain, CHAINS, type ChainId } from '../../wallet/chains';
import { truncateAddress } from '../../wallet/format-address';
import BrandIcon from '../BrandIcon';
import Icon from '../Icon';

/** Matches the create-room sheet: one gap, a touch tighter than the app. */
const GAP = 13;

type Props = {
  evmAddress: string;
  selected: ChainId;
  onSelect: (chainId: ChainId) => void;
};

export default function ChainSelector({
  evmAddress,
  selected,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeChain = CHAINS.find(c => c.id === selected) ?? CHAINS[0];
  const activeAddress = addressForChain(selected, evmAddress);

  const handleSelect = (chainId: ChainId) => {
    onSelect(chainId);
    setOpen(false);
  };

  const handleCopy = () => {
    Clipboard.setString(activeAddress);
    setCopied(true);
  };

  const close = () => {
    setOpen(false);
    setCopied(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Select network"
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
      >
        <BrandIcon type={activeChain.icon} size={26} />
        <Text style={styles.pillText}>{truncateAddress(activeAddress)}</Text>
        <Icon type="chevron-down" color={colors.textMuted} size={18} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={close}
      >
        <Pressable style={styles.overlay} onPress={close} />
        <SafeAreaView
          style={styles.sheetWrapper}
          pointerEvents="box-none"
          edges={['bottom']}
        >
          <View style={styles.sheet}>
            <View style={styles.dragHandle} />
            <Text style={styles.title}>Select network</Text>

            <View style={styles.list}>
              {CHAINS.map(chain => {
                const isSelected = chain.id === selected;
                const address = addressForChain(chain.id, evmAddress);
                return (
                  <Pressable
                    key={chain.id}
                    disabled={!chain.enabled}
                    onPress={() => handleSelect(chain.id)}
                    style={({ pressed }) => [
                      styles.chainRow,
                      isSelected && styles.chainRowSelected,
                      !chain.enabled && styles.chainRowDisabled,
                      pressed && chain.enabled && styles.pressed,
                    ]}
                  >
                    <View style={styles.chainIcon}>
                      <BrandIcon type={chain.icon} size={30} />
                    </View>
                    <View style={styles.chainMid}>
                      <View style={styles.chainNameRow}>
                        <Text style={styles.chainName}>{chain.name}</Text>
                        {!chain.enabled && (
                          <Text style={styles.soon}>Soon</Text>
                        )}
                      </View>
                      <Text style={styles.chainAddress}>
                        {truncateAddress(address)}
                      </Text>
                    </View>
                    {isSelected && (
                      <Icon type="check" color={colors.accent} size={20} />
                    )}
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={handleCopy}
              style={({ pressed }) => [
                styles.copyRow,
                pressed && styles.pressed,
              ]}
            >
              <Icon
                type={copied ? 'check' : 'copy'}
                color={copied ? colors.success : colors.textSecondary}
                size={16}
              />
              <Text style={styles.copyText}>
                {copied ? 'Address copied' : `Copy ${activeChain.name} address`}
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-end',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingLeft: 5,
    paddingRight: spacing.sm,
    paddingVertical: 5,
  },
  pillText: {
    fontFamily: mono.semiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  pressed: {
    opacity: 0.7,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6,6,9,0.7)',
  },
  sheetWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    // One uniform vertical rhythm between every block in the sheet.
    gap: GAP,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
  },
  title: {
    fontFamily: display.bold,
    fontSize: 22,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  list: {
    gap: GAP,
  },
  chainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  chainRowSelected: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  chainRowDisabled: {
    opacity: 0.45,
  },
  chainIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chainMid: {
    flex: 1,
    gap: 2,
  },
  chainNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chainName: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  soon: {
    fontFamily: mono.semiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textMuted,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  chainAddress: {
    fontFamily: mono.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  copyText: {
    fontFamily: mono.medium,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
