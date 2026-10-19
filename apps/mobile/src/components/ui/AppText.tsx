import { Text, type TextProps, type StyleProp, type TextStyle } from 'react-native';

import { colors } from '../../theme/colors';
import { type as typePresets } from '../../theme/typography';

export type TextVariant = keyof typeof typePresets;

type Props = TextProps & {
  variant?: TextVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
};

export default function AppText({
  variant = 'body',
  color = colors.textPrimary,
  style,
  ...rest
}: Props) {
  return <Text {...rest} style={[typePresets[variant], { color }, style]} />;
}
