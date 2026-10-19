import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useKeyboardDoneId } from './KeyboardDoneBar';

import Icon from '../Icon';
import { colors, radius, spacing } from '../../theme/colors';
import { mono } from '../../theme/typography';

type Props = {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
  editable?: boolean;
};

export default function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  format = v => v.toFixed(2),
  editable = false,
}: Props) {
  const doneId = useKeyboardDoneId();
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  // Raw keystrokes while focused, so partial values like "0." survive; null means show the formatted value.
  const [draft, setDraft] = useState<string | null>(null);

  const handleChangeText = (text: string) => {
    const cleaned = text.replace(/[^0-9.]/g, '');
    setDraft(cleaned);
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed)) {
      // Cap the top while typing, but apply the min only on blur so it doesn't fight the keystrokes.
      onChange(Math.min(max, parsed));
    }
  };

  const commit = () => {
    if (draft !== null) {
      const parsed = Number.parseFloat(draft);
      onChange(clamp(Number.isFinite(parsed) ? parsed : value));
    }
    setDraft(null);
  };

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease"
        onPress={() => onChange(clamp(value - step))}
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      >
        <Icon type="minus" color={colors.textPrimary} size={20} />
      </Pressable>

      {editable ? (
        <TextInput
          style={[styles.valueBox, styles.value, styles.input]}
          value={draft ?? format(value)}
          onChangeText={handleChangeText}
          onFocus={() => setDraft(format(value))}
          onBlur={commit}
          keyboardType="decimal-pad"
          inputAccessoryViewID={doneId}
          inputMode="decimal"
          selectTextOnFocus
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          accessibilityLabel="Amount"
          selectionColor={colors.accent}
        />
      ) : (
        <View style={styles.valueBox}>
          <Text style={styles.value}>{format(value)}</Text>
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase"
        onPress={() => onChange(clamp(value + step))}
        style={({ pressed }) => [styles.btn, styles.btnAccent, pressed && styles.pressed]}
      >
        <Icon type="plus" color={colors.onAccent} size={20} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  btn: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  btnAccent: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  pressed: {
    opacity: 0.8,
  },
  valueBox: {
    flex: 1,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  input: {
    textAlign: 'center',
    paddingVertical: 0,
  },
  value: {
    fontFamily: mono.bold,
    fontSize: 22,
    letterSpacing: 1,
    color: colors.textPrimary,
  },
});
