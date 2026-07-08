import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors } from '../../theme/colors';
import { type as typePresets } from '../../theme/typography';

type Props = {
  children: string;
  /** Optional right-aligned action (e.g. "View all"). */
  action?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Uppercase mono eyebrow that precedes a section ("ASSETS", "RECENT MATCHES"). */
export default function SectionLabel({
  children,
  action,
  onActionPress,
  style,
}: Props) {
  return (
    <View style={[styles.row, style]}>
      <Text style={[typePresets.label, styles.label]}>{children}</Text>
      {action ? (
        <Pressable onPress={onActionPress} hitSlop={8}>
          <Text style={styles.action}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    color: colors.textMuted,
  },
  action: {
    ...typePresets.caption,
    fontFamily: typePresets.button.fontFamily,
    color: colors.accentLight,
  },
});
