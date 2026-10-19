import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import Icon, { type IconName } from '../Icon';
import { colors, radius, spacing } from '../../theme/colors';
import { type as typePresets } from '../../theme/typography';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'tinted'
  | 'ghost'
  | 'danger'
  | 'gold'
  | 'goldOutline';
export type ButtonSize = 'lg' | 'md' | 'sm';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  trailingIcon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  trailingIcon,
  disabled = false,
  loading = false,
  fullWidth = true,
  style,
}: Props) {
  const v = VARIANTS[variant];
  const s = SIZES[size];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={label}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { height: s.height, paddingHorizontal: s.padX, borderRadius: s.radius },
        { backgroundColor: v.bg, borderColor: v.border, borderWidth: v.border ? 1 : 0 },
        variant === 'primary' && !isDisabled && styles.primaryGlow,
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.inner}>
          {icon ? <Icon type={icon} color={v.fg} size={s.icon} /> : null}
          <Text style={[typePresets.button, { fontSize: s.font, color: v.fg }]}>
            {label}
          </Text>
          {trailingIcon ? (
            <Icon type={trailingIcon} color={v.fg} size={s.icon} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const VARIANTS: Record<
  ButtonVariant,
  { bg: string; fg: string; border?: string }
> = {
  primary: { bg: colors.accent, fg: colors.onAccent },
  secondary: { bg: 'transparent', fg: colors.textPrimary, border: colors.borderStrong },
  outline: { bg: 'transparent', fg: colors.accent, border: colors.accent },
  tinted: { bg: colors.accentSoft, fg: colors.accentLight },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  ghost: { bg: 'transparent', fg: colors.textSecondary },
  gold: { bg: colors.gold, fg: colors.onAccent },
  goldOutline: { bg: 'transparent', fg: colors.gold, border: colors.goldBorder },
};

const SIZES: Record<
  ButtonSize,
  { height: number; padX: number; radius: number; font: number; icon: number }
> = {
  lg: { height: 56, padX: spacing.lg, radius: radius.md, font: 16, icon: 20 },
  md: { height: 46, padX: spacing.md, radius: radius.md, font: 15, icon: 18 },
  sm: { height: 38, padX: spacing.md, radius: radius.sm, font: 13, icon: 16 },
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryGlow: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.4,
  },
});
