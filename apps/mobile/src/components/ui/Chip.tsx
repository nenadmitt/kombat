import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing } from '../../theme/colors';
import { mono } from '../../theme/typography';

export type ChipTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'danger'
  | 'gold'
  | 'outline';

type Props = {
  label: string;
  tone?: ChipTone;
  /** Small uppercase mono badge (default) vs regular-case. */
  uppercase?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Mono pill/badge — the design's recurring micro-label (DEMO, WIN, KEEP SECRET,
 * feature tags). Filled soft-tint by default; `outline` for a hairline chip.
 */
export default function Chip({
  label,
  tone = 'neutral',
  uppercase = true,
  style,
}: Props) {
  const t = TONES[tone];
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: t.bg, borderColor: t.border ?? 'transparent', borderWidth: t.border ? 1 : 0 },
        style,
      ]}
    >
      <Text
        style={[styles.text, { color: t.fg }, uppercase && styles.upper]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const TONES: Record<ChipTone, { bg: string; fg: string; border?: string }> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary },
  accent: { bg: colors.accentSoft, fg: colors.accentLight },
  success: { bg: colors.successSoft, fg: colors.success },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  gold: { bg: colors.goldSoft, fg: colors.gold },
  outline: { bg: 'transparent', fg: colors.textSecondary, border: colors.borderStrong },
};

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  text: {
    fontFamily: mono.semiBold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  upper: {
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
