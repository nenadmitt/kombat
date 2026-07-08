import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Icon from '../../../components/Icon';
import { colors, spacing } from '../../../theme/colors';
import { fonts } from '../../../theme/typography';

/** Shown after a player submits their fleet, until the opponent is ready. */
export default function WaitingForOpponent() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.iconRing}>
          <Icon type="anchor" color={colors.brandStart} size={34} />
        </View>
        <Text style={styles.title}>Fleet deployed</Text>
        <Text style={styles.subtitle}>Waiting for your opponent…</Text>
        <ActivityIndicator
          color={colors.brandStart}
          style={styles.spinner}
          size="small"
        />
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: colors.brandStart,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
  },
  spinner: {
    marginTop: spacing.sm,
  },
});
