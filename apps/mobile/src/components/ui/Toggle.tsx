import { Switch, Platform } from 'react-native';

import { colors } from '../../theme/colors';

type Props = {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
};

export default function Toggle({ value, onValueChange, disabled }: Props) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: colors.canvas, true: colors.accent }}
      thumbColor={Platform.OS === 'android' ? colors.textPrimary : undefined}
      ios_backgroundColor={colors.canvas}
    />
  );
}
