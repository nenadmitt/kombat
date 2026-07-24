import { Switch, Platform } from 'react-native';

import { colors } from '../../theme/colors';

type Props = {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
};

/** Accent-tinted switch used for Private Room / Demo Mode toggles. */
export default function Toggle({ value, onValueChange, disabled }: Props) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      // Off-state track is the dark canvas (not surfaceMuted) so a switch
      // sitting on a surface card reads as clearly "off".
      trackColor={{ false: colors.canvas, true: colors.accent }}
      thumbColor={Platform.OS === 'android' ? colors.textPrimary : undefined}
      ios_backgroundColor={colors.canvas}
    />
  );
}
