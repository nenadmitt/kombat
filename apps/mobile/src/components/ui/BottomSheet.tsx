import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '../../theme/colors';
import { display } from '../../theme/typography';
import Icon from '../Icon';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Show a round X in the title row. */
  showClose?: boolean;
  children: ReactNode;
};

/** Slide-up sheet chrome (dim overlay, drag handle, optional title). */
export default function BottomSheet({
  visible,
  onClose,
  title,
  showClose,
  children,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose} />
      <SafeAreaView style={styles.wrapper} pointerEvents="box-none" edges={['bottom']}>
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />
          {title || showClose ? (
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              {showClose ? (
                <Pressable
                  onPress={onClose}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  style={styles.closeBtn}
                >
                  <Icon type="close" color={colors.textSecondary} size={18} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {children}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6,6,9,0.7)',
  },
  wrapper: {
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
  },
  dragHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: display.bold,
    fontSize: 22,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
