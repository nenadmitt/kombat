import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Icon from '../components/Icon';
import { Button } from '../components/ui';
import { APP_VERSION } from '../config/app-version';
import { useServerStore } from '../store/server.store';
import { colors, radius, spacing } from '../theme/colors';
import { mono, type } from '../theme/typography';

const DEFAULT_MESSAGE =
  'This build can no longer connect to the platform. Update to keep playing - your pot and history are unaffected.';

/** Deliberately has no dismiss: the only way forward is the update. */
export default function UpdateRequiredScreen() {
  const update = useServerStore(s => s.update);

  const url =
    Platform.OS === 'ios' ? update?.urls.ios : update?.urls.android;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <View style={styles.iconTile}>
          <View style={styles.iconDisc}>
            <Icon type="arrow-up" color={colors.onAccent} size={22} />
          </View>
        </View>

        <Text style={[type.label, styles.eyebrow]}>UPDATE REQUIRED</Text>
        <Text style={styles.title}>A new version{'\n'}is available</Text>
        <Text style={styles.message}>{update?.message ?? DEFAULT_MESSAGE}</Text>

        <View style={styles.versionCard}>
          <Text style={styles.versionOld}>{APP_VERSION}</Text>
          <Icon type="arrow-right" color={colors.textMuted} size={16} />
          <Text style={styles.versionNew}>{update?.latestVersion ?? ''}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        {url ? (
          <Button
            label="Update now"
            icon="arrow-down"
            onPress={() => {
              void Linking.openURL(url);
            }}
          />
        ) : null}
        <Text style={styles.footnote}>
          Kombat requires this update to continue.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  iconTile: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  iconDisc: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  title: {
    ...type.hero,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  message: {
    ...type.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  versionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  versionOld: {
    fontFamily: mono.bold,
    fontSize: 15,
    color: colors.textMuted,
  },
  versionNew: {
    fontFamily: mono.bold,
    fontSize: 15,
    color: colors.accent,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  footnote: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
