import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Icon from '../components/Icon';
import { colors, spacing } from '../theme/colors';
import { fonts } from '../theme/typography';

/** No transaction data exists yet — same reason the wallet screen dropped its transactions section. */
export default function HistoryScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>History</Text>
        <View style={styles.empty}>
          <Icon type="history" color={colors.textMuted} size={40} />
          <Text style={styles.emptyText}>No activity yet</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
