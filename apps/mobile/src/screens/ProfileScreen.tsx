import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientView } from '../components/GradientView';
import { useCurrentUserStore } from '../store/currentUser.store';
import { truncateAddress } from '../wallet/format-address';
import { brandGradient, colors, radius, spacing } from '../theme/colors';

/** Mocked — no XP/stats/achievements system exists yet. Values match the Figma design. */
const MOCK_LEVEL = 24;
const MOCK_STATS = [
  { label: '156 Games' },
  { label: '62% Win Rate' },
  { label: '$4,240 Total' },
] as const;
const MOCK_ACHIEVEMENTS = [
  { icon: '🏆', label: 'Top Gun' },
  { icon: '🔥', label: '10 Streak' },
  { icon: '👑', label: 'Whale' },
  { icon: '⚡', label: 'Fast Hand' },
] as const;

const SETTINGS_ROWS = [
  { key: 'notifications', icon: '🔔', label: 'Notifications' },
  { key: 'security', icon: '🔒', label: 'Security & Wallet' },
  { key: 'help', icon: '❓', label: 'Help & Support' },
  { key: 'terms', icon: '📄', label: 'Terms of Service' },
] as const;

export default function ProfileScreen() {
  const username = useCurrentUserStore(state => state.username);
  const wallet = useCurrentUserStore(state => state.wallet);
  const logout = useCurrentUserStore(state => state.logout);

  const initial = (username ?? '?').charAt(0).toUpperCase();
  const referralCode = username ? `${username.toUpperCase()}_REF` : '—';

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.avatarRing}>
            <GradientView
              colors={brandGradient.colors}
              positions={brandGradient.positions}
              style={styles.avatar}
            >
              <Text style={styles.avatarInitial}>{initial}</Text>
            </GradientView>
            <View style={styles.levelBadge}>
              <Text style={styles.levelText}>LVL {MOCK_LEVEL}</Text>
            </View>
          </View>
          <Text style={styles.username}>{username ?? 'Player'}</Text>
          {wallet ? (
            <View style={styles.addressChip}>
              <Text style={styles.addressText}>
                {truncateAddress(wallet.address)}
              </Text>
              <Text style={styles.copyIcon}>⧉</Text>
            </View>
          ) : null}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {MOCK_STATS.map(stat => (
            <View key={stat.label} style={styles.statChip}>
              <Text style={styles.statText}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Achievements */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Achievements</Text>
            <Text style={styles.seeAll}>See all</Text>
          </View>
          <View style={styles.achievementsRow}>
            {MOCK_ACHIEVEMENTS.map(achievement => (
              <View key={achievement.label} style={styles.achievementCard}>
                <View style={styles.achievementIconCircle}>
                  <Text style={styles.achievementIcon}>{achievement.icon}</Text>
                </View>
                <Text style={styles.achievementLabel}>{achievement.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Referral */}
        <View style={styles.referralCard}>
          <Text style={styles.referralTitle}>Invite &amp; Earn</Text>
          <Text style={styles.referralSubtitle}>
            Get 5% of entry fees from your referrals.
          </Text>
          <View style={styles.referralRow}>
            <View style={styles.referralCodeBox}>
              <Text style={styles.referralCode}>{referralCode}</Text>
              <Text style={styles.copyIcon}>⧉</Text>
            </View>
            <Pressable style={styles.shareButton}>
              <Text style={styles.shareIcon}>⇪</Text>
            </Pressable>
          </View>
        </View>

        {/* Settings */}
        <View style={styles.settingsList}>
          {SETTINGS_ROWS.map(row => (
            <Pressable key={row.key} style={styles.settingsRow}>
              <View style={styles.settingsRowLeft}>
                <Text style={styles.settingsIcon}>{row.icon}</Text>
                <Text style={styles.settingsLabel}>{row.label}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
          <Pressable style={styles.signOutRow} onPress={() => logout()}>
            <Text style={styles.signOutIcon}>⇥</Text>
            <Text style={styles.signOutLabel}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    gap: spacing.lg,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    gap: spacing.xs + 4,
  },
  avatarRing: {
    width: 100,
    height: 100,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: colors.brandStart,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  levelBadge: {
    position: 'absolute',
    bottom: -7,
    right: -7,
    backgroundColor: colors.brandStart,
    borderRadius: 8,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 4,
  },
  levelText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  username: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  addressChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.cardBackground,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  addressText: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: 'Menlo',
  },
  copyIcon: {
    fontSize: 14,
    color: colors.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    width: '100%',
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.chip,
    paddingVertical: spacing.sm,
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  section: {
    width: '100%',
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.brandStart,
  },
  achievementsRow: {
    flexDirection: 'row',
    gap: spacing.xs + 6,
  },
  achievementCard: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.cardBackground,
    borderRadius: radius.card,
    padding: spacing.sm,
  },
  achievementIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.kombatAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  achievementIcon: {
    fontSize: 18,
  },
  achievementLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  referralCard: {
    width: '100%',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.brandStart,
    borderRadius: radius.card + 4,
    padding: spacing.sm + 4,
    gap: spacing.sm,
  },
  referralTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  referralSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
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
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: spacing.sm - 4,
  },
  referralCode: {
    fontSize: 13,
    color: colors.textPrimary,
    fontFamily: 'Menlo',
  },
  shareButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.brandStart,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareIcon: {
    fontSize: 18,
    color: colors.textPrimary,
  },
  settingsList: {
    width: '100%',
    gap: spacing.xs - 2,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.chip,
    padding: spacing.sm - 2,
  },
  settingsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingsIcon: {
    fontSize: 18,
  },
  settingsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  chevron: {
    fontSize: 18,
    color: colors.textMuted,
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  signOutIcon: {
    fontSize: 18,
    color: colors.danger,
  },
  signOutLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.danger,
  },
});
