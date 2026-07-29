import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Icon from '../components/Icon';
import { colors, radius, spacing } from '../theme/colors';
import { display, fonts } from '../theme/typography';

type Props = {
  /** Why the snapshot has not landed. Null while it is merely still loading. */
  error?: string | null;
  /** Leave the match. Always rendered - a load that never completes must
   *  never trap the player on this screen. */
  onLeave: () => void;
};

/**
 * The shared "waiting for the match snapshot" screen.
 *
 * Two rules it exists to enforce, both learned the hard way:
 * a stuck load always says why, and it always offers a way out. A bare
 * spinner with neither is unreportable by the player and undebuggable by us.
 */
export default function MatchLoading({ error, onLeave }: Props) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.title}>
          {error ? 'Could not open the match' : 'Loading match'}
        </Text>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <Text style={styles.hint}>Waiting for the server...</Text>
        )}
      </View>

      <Pressable style={styles.leave} onPress={onLeave}>
        <Icon type="chevron-left" color={colors.textPrimary} size={18} />
        <Text style={styles.leaveText}>Leave</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontFamily: display.bold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    textAlign: 'center',
  },
  leave: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  leaveText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
});
