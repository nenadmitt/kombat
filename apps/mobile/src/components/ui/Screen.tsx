import {
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, spacing } from '../../theme/colors';

type Props = {
  children: React.ReactNode;
  /** Wrap content in a vertical ScrollView. */
  scroll?: boolean;
  /** Safe-area edges to inset. Defaults to top only (tab bar owns the bottom). */
  edges?: readonly Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  /** Extra bottom padding for scroll content (space above the tab bar). */
  bottomInset?: number;
};

/** Standard flat-canvas screen frame: background + safe area + padded content. */
export default function Screen({
  children,
  scroll = false,
  edges = ['top'],
  contentStyle,
  bottomInset = spacing.xl,
}: Props) {
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: bottomInset },
            contentStyle,
          ]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.flex, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    // One uniform vertical rhythm between every top-level block.
    gap: spacing.md,
  },
});
