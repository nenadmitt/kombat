import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, Circle, SweepGradient, vec } from '@shopify/react-native-skia';

import Icon, { type IconName } from '../components/Icon';
import { AddressPill, Button, Card, Screen, SectionLabel } from '../components/ui';
import { useCurrentUserStore } from '../store/currentUser.store';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';

/** Mocked - no XP/stats/achievements system yet. Values mirror the design. */
const MOCK_LEVEL = 24;
const MOCK_STATS = [
  { value: '156', label: 'Games' },
  { value: '62%', label: 'Win rate' },
  { value: '$4.2k', label: 'Earned' },
] as const;
const MOCK_ACHIEVEMENTS = [
  { icon: 'trophy' as IconName, label: 'Top Gun' },
  { icon: 'flame' as IconName, label: '10 Streak' },
  { icon: 'crown' as IconName, label: 'Whale' },
] as const;

const SETTINGS_ROWS = [
  { key: 'notifications', icon: 'bell' as IconName, label: 'Notifications' },
  { key: 'security', icon: 'shield' as IconName, label: 'Security & Wallet' },
  { key: 'help', icon: 'help' as IconName, label: 'Help & Support' },
  { key: 'terms', icon: 'file-text' as IconName, label: 'Terms of Service' },
] as const;

export default function ProfileScreen() {
  const username = useCurrentUserStore(state => state.username);
  const wallet = useCurrentUserStore(state => state.wallet);
  const logout = useCurrentUserStore(state => state.logout);

  const initial = (username ?? '?').charAt(0).toUpperCase();
  const referralCode = username ? `${username.toUpperCase()}_REF` : '-';

  return (
    <Screen scroll contentStyle={styles.content}>
      {/* Avatar + name + address (centered); everything below is full-width.
          One uniform gap between every element (the design's flat rhythm). */}
      <View style={styles.avatarRing}>
        {/* Conic (sweep) accent ring behind the avatar disc. */}
        <Canvas style={StyleSheet.absoluteFill}>
          <Circle cx={52} cy={52} r={52}>
            <SweepGradient
              c={vec(52, 52)}
              colors={[colors.accent, colors.accent400, colors.accent200, colors.accent]}
            />
          </Circle>
        </Canvas>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
        <View style={styles.levelBadge}>
          <Text style={styles.levelText}>LVL {MOCK_LEVEL}</Text>
        </View>
      </View>
      <Text style={styles.username}>{username ?? 'Player'}</Text>
      {wallet ? <AddressPill address={wallet.address} /> : null}

      {/* Mini stats */}
      <View style={[styles.statsRow, styles.block]}>
        {MOCK_STATS.map(stat => (
          <View key={stat.label} style={styles.statChip}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={[type.label, styles.statLabel]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Achievements */}
      <SectionLabel action="See all" style={styles.block}>
        Achievements
      </SectionLabel>
      <View style={[styles.achievementsRow, styles.block]}>
        {MOCK_ACHIEVEMENTS.map(achievement => (
          <Card key={achievement.label} style={styles.achievementCard}>
            <View style={styles.achievementIcon}>
              <Icon type={achievement.icon} color={colors.onAccent} size={20} />
            </View>
            <Text style={styles.achievementLabel}>{achievement.label}</Text>
          </Card>
        ))}
      </View>

      {/* Referral */}
      <Card accent style={[styles.referralCard, styles.block]}>
        <Text style={styles.referralTitle}>Invite &amp; Earn</Text>
        <Text style={styles.referralSubtitle}>
          Get 5% of entry fees from referrals.
        </Text>
        <View style={styles.referralRow}>
          <View style={styles.referralCodeBox}>
            <Text style={styles.referralCode}>{referralCode}</Text>
            <Icon type="copy" color={colors.textMuted} size={14} />
          </View>
          <Pressable style={styles.shareButton} accessibilityLabel="Share referral">
            <Icon type="share" color={colors.onAccent} size={18} />
          </Pressable>
        </View>
      </Card>

      {/* Settings */}
      <View style={[styles.settingsList, styles.block]}>
        {SETTINGS_ROWS.map(row => (
          <Card key={row.key} onPress={() => {}} style={styles.settingsRow}>
            <View style={styles.settingsRowLeft}>
              <Icon type={row.icon} color={colors.textSecondary} size={20} />
              <Text style={styles.settingsLabel}>{row.label}</Text>
            </View>
            <Icon type="chevron-right" color={colors.textMuted} size={18} />
          </Card>
        ))}
      </View>

      <Button
        label="Sign Out"
        icon="log-out"
        variant="danger"
        onPress={() => logout()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    // Center the avatar/name/address; one uniform gap between every element.
    alignItems: 'center',
    gap: spacing.md,
  },
  // Full-width rows inside the centered stack.
  block: {
    alignSelf: 'stretch',
  },
  avatarRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: display.bold,
    fontSize: 36,
    color: colors.textPrimary,
  },
  levelBadge: {
    position: 'absolute',
    bottom: -8,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderWidth: 3,
    borderColor: colors.background,
  },
  levelText: {
    fontFamily: mono.bold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.onAccent,
  },
  username: {
    ...type.title,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xxs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
  },
  statValue: {
    fontFamily: mono.bold,
    fontSize: 20,
    color: colors.textPrimary,
  },
  statLabel: {
    color: colors.textMuted,
  },
  achievementsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  achievementCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  achievementIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  achievementLabel: {
    ...type.caption,
    fontFamily: type.button.fontFamily,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  referralCard: {
    gap: spacing.sm,
  },
  referralTitle: {
    ...type.heading,
    color: colors.textPrimary,
  },
  referralSubtitle: {
    ...type.caption,
    color: colors.textSecondary,
  },
  referralRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  referralCodeBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.canvas,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  referralCode: {
    fontFamily: mono.semiBold,
    fontSize: 14,
    letterSpacing: 1,
    color: colors.textPrimary,
  },
  shareButton: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsList: {
    gap: spacing.xs,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  settingsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingsLabel: {
    ...type.subheading,
    fontSize: 15,
    color: colors.textPrimary,
  },
});
