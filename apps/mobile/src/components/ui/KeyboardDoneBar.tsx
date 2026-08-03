import { createContext, useContext } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, spacing } from '../../theme/colors';
import { type } from '../../theme/typography';

/** Fallback for inputs outside any BottomSheet, paired with a screen-level
 *  <KeyboardDoneBar />. */
export const KEYBOARD_DONE_ID = 'keyboard-done-bar';

/**
 * iOS resolves `inputAccessoryViewID` globally, so two mounted bars sharing
 * one id fight over it - and a sheet animating out can steal the binding from
 * the sheet being presented. BottomSheet therefore provides a per-instance id
 * through this context; inputs read it with `useKeyboardDoneId()`.
 */
export const KeyboardDoneIdContext = createContext(KEYBOARD_DONE_ID);

export function useKeyboardDoneId(): string {
  return useContext(KeyboardDoneIdContext);
}

/** iOS number pads ship no return key, so dismissing needs its own control. */
export default function KeyboardDoneBar({
  nativeID = KEYBOARD_DONE_ID,
}: {
  nativeID?: string;
}) {
  if (Platform.OS !== 'ios') {
    return null;
  }
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View style={styles.bar}>
        <Pressable
          onPress={() => Keyboard.dismiss()}
          hitSlop={spacing.xs}
          accessibilityRole="button"
          accessibilityLabel="Done"
          style={styles.button}
        >
          <Text style={styles.label}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  button: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  label: {
    ...type.button,
    color: colors.accent,
  },
});
