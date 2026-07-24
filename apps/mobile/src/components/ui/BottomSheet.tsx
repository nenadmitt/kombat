import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '../../theme/colors';
import { display, type as typePresets } from '../../theme/typography';
import Icon from '../Icon';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Optional one-liner under the title. */
  subtitle?: string;
  /** Show a round X in the title row. */
  showClose?: boolean;
  /** When set, children are laid out with this uniform vertical gap. */
  gap?: number;
  /** Fired once the sheet has fully animated away (iOS Modal onDismiss). */
  onDismissed?: () => void;
  children: ReactNode;
};

/** Slide-up sheet chrome (dim overlay, drag handle, optional title/subtitle). */
export default function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  showClose,
  gap,
  onDismissed,
  children,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismissed}
    >
      <Pressable style={styles.overlay} onPress={onClose} />
      <SafeAreaView style={styles.wrapper} pointerEvents="box-none" edges={['bottom']}>
        <View style={[styles.sheet, gap != null && { gap }]}>
          <View style={[styles.dragHandle, gap == null && styles.dragHandleSpaced]} />
          {title || showClose ? (
            <View style={[styles.header, gap == null && styles.headerSpaced]}>
              <View style={styles.headerText}>
                {title ? <Text style={styles.title}>{title}</Text> : null}
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
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
    backgroundColor: colors.borderStrong,
  },
  dragHandleSpaced: {
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerSpaced: {
    marginBottom: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    fontFamily: display.bold,
    fontSize: 26,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typePresets.body,
    color: colors.textSecondary,
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
