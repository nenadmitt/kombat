import { useId, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '../../theme/colors';
import { display, type as typePresets } from '../../theme/typography';
import Icon from '../Icon';
import KeyboardDoneBar, { KeyboardDoneIdContext } from './KeyboardDoneBar';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  showClose?: boolean;
  gap?: number;
  onDismissed?: () => void;
  children: ReactNode;
};

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
  // Per-sheet id: iOS resolves inputAccessoryViewID globally, so a shared one lets a dismissing sheet steal the Done bar.
  const doneId = `keyboard-done-${useId()}`;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismissed}
    >
      <Pressable style={styles.overlay} onPress={onClose} />
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        pointerEvents="box-none"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <SafeAreaView
          style={styles.wrapper}
          pointerEvents="box-none"
          edges={['bottom']}
        >
          <Pressable
            style={[styles.sheet, gap != null && { gap }]}
            onPress={Keyboard.dismiss}
            accessible={false}
          >
            <View
              style={[styles.dragHandle, gap == null && styles.dragHandleSpaced]}
            />
            {title || showClose ? (
              <View style={[styles.header, gap == null && styles.headerSpaced]}>
                <View style={styles.headerText}>
                  {title ? <Text style={styles.title}>{title}</Text> : null}
                  {subtitle ? (
                    <Text style={styles.subtitle}>{subtitle}</Text>
                  ) : null}
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
            <KeyboardDoneIdContext.Provider value={doneId}>
              {children}
            </KeyboardDoneIdContext.Provider>
          </Pressable>
        </SafeAreaView>
      </KeyboardAvoidingView>
      <KeyboardDoneBar nativeID={doneId} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6,6,9,0.7)',
  },
  keyboardAvoid: {
    flex: 1,
  },
  wrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
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
    borderRadius: radius.pill,
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
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
