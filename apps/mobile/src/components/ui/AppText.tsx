import { Text, type TextProps, type StyleProp, type TextStyle } from 'react-native';

import { colors } from '../../theme/colors';
import { type as typePresets } from '../../theme/typography';

export type TextVariant = keyof typeof typePresets;

type Props = TextProps & {
  variant?: TextVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
};

/**
 * Text bound to the semantic type scale (see theme/typography `type`). Use
 * `variant` for the role and `color` for a token override — keeps screens off
 * ad-hoc font sizes/families.
 */
export default function AppText({
  variant = 'body',
  color = colors.textPrimary,
  style,
  ...rest
}: Props) {
  return <Text {...rest} style={[typePresets[variant], { color }, style]} />;
}
