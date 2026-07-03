import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientView } from '../components/GradientView';
import Icon, { type IconName } from '../components/Icon';
import { useCurrentUserStore } from '../store/currentUser.store';
import { truncateAddress } from '../wallet/format-address';
import { brandGradient, colors, radius, spacing } from '../theme/colors';
import { fonts } from '../theme/typography';

/** Mocked — no XP/stats/achievements system exists yet. Values match the Figma design. */
const MOCK_LEVEL = 24;
const MOCK_STATS = [
  { label: '156 Games' },
  { label: '62% Win Rate' },
  { label: '$4,240 Total' },
] as const;
const MOCK_ACHIEVEMENTS = [
  { icon: 'trophy' as IconName, label: 'Top Gun' },
  { icon: 'flame' as IconName, label: '10 Streak' },
  { icon: 'crown' as IconName, label: 'Whale' },
  { icon: 'zap' as IconName, label: 'Fast Hand' },
] as const;

const SETTINGS_ROWS = [
  { key: 'notifications', icon: 'bell' as IconName, label: 'Notifications' },
  { key: 'security', icon: 'lock' as IconName, label: 'Security & Wallet' },
  { key: 'help', icon: 'help' as IconName, label: 'Help & Support' },
  { key: 'terms', icon: 'file-text' as IconName, label: 'Terms of Service' },
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
              <Icon type="copy" color={colors.textMuted} size={14} />
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
                  <Icon type={achievement.icon} color={colors.textPrimary} size={18} />
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
              <Icon type="copy" color={colors.textMuted} size={14} />
            </View>
            <Pressable style={styles.shareButton}>
              <Icon type="share" color={colors.textPrimary} size={18} />
            </Pressable>
          </View>
        </View>

        {/* Settings */}
        <View style={styles.settingsList}>
          {SETTINGS_ROWS.map(row => (
            <Pressable key={row.key} style={styles.settingsRow}>
              <View style={styles.settingsRowLeft}>
                <Icon type={row.icon} color={colors.textPrimary} size={18} />
                <Text style={styles.settingsLabel}>{row.label}</Text>
              </View>
              <Icon type="chevron-right" color={colors.textMuted} size={18} />
            </Pressable>
          ))}
          <Pressable style={styles.signOutRow} onPress={() => logout()}>
            <Icon type="log-out" color={colors.danger} size={18} />
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
    fontFamily: fonts.extraBold,
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
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
  },
  username: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: fonts.bold,
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
    fontFamily: fonts.semiBold,
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
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
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
  achievementLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
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
    fontFamily: fonts.semiBold,
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
  settingsLabel: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  signOutLabel: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: colors.danger,
  },
});
