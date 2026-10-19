import { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { achievementsFor, type AchievementId } from '@gaming-platform/core';

import Icon, { type IconName } from '../components/Icon';
import SettingsSheet from '../components/profile/SettingsSheet';
import { Card, Screen, SectionLabel, StatTile } from '../components/ui';
import GameIcon from '../games/GameIcon';
import { GAME_TYPE_LABELS } from '../games/game-type-labels';
import { useCooldown } from '../hooks/useCooldown';
import { useCurrentUserStore } from '../store/currentUser.store';
import { usePlayerStatsStore } from '../store/playerStats.store';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';

const ACHIEVEMENT_ICONS: Record<AchievementId, IconName> = {
  'first-blood': 'target',
  'top-gun': 'trophy',
  veteran: 'shield',
  whale: 'crown',
};

const REFERRAL_PLACEHOLDER = { invited: 0, matches: 0, earned: '$0.00' } as const;

const GAME_COUNT = Object.keys(GAME_TYPE_LABELS).length;

const AVATAR = 76;
const TAP_TARGET = 44;
const BADGE = 52;
const ICON_TILE = 32;
const REFERRAL_TILE = 40;

function joinedLabel(joinedAt: string | null): string {
  if (!joinedAt) {
    return '-';
  }
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(joinedAt).getTime()) / 86_400_000),
  );
  if (days < 90) {
    return `${days}d`;
  }
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return years > 0 ? `${years}y ${months}m` : `${months}m`;
}

export default function ProfileScreen() {
  const username = useCurrentUserStore(state => state.username);
  const referralCode = useCurrentUserStore(state => state.referralCode);
  const logout = useCurrentUserStore(state => state.logout);

  const stats = usePlayerStatsStore(state => state.stats);
  const loaded = usePlayerStatsStore(state => state.fetchedAt !== null);
  const load = usePlayerStatsStore(state => state.load);
  const [copied, setCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCooldown(() => void load({ force: true }));

  const initial = (username ?? '?').charAt(0).toUpperCase();
  const achievements = achievementsFor(stats);
  const unlocked = achievements.filter(a => a.unlocked).length;
  const shareable = referralCode ?? null;

  const handleCopyCode = useCallback(() => {
    if (!shareable) {
      return;
    }
    Clipboard.setString(shareable);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [shareable]);

  const handleShare = useCallback(() => {
    if (!shareable) {
      return;
    }
    Share.share({
      message: `Play KryptoKombat with me - use my code ${shareable} when you sign up.`,
    }).catch(() => {
    });
  }, [shareable]);

  // Before the first fetch the store holds zeroes; hold the dash until the aggregate arrives.
  const stat = (value: number | string) => (loaded ? `${value}` : '-');

  return (
    <Screen scroll>
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
        <View style={styles.identityText}>
          <Text style={styles.username} numberOfLines={1}>
            {username ?? 'Player'}
          </Text>
          <View style={styles.identityActions}>
            <Pressable
              style={styles.iconButton}
              onPress={refresh.run}
              disabled={!refresh.ready}
              accessibilityRole="button"
              accessibilityState={{ disabled: !refresh.ready }}
              accessibilityLabel={
                refresh.ready ? 'Refresh stats' : `Refresh again in ${refresh.secondsLeft}s`
              }
            >
              {/* Toned, not dimmed: a dimming opacity drops the glyph under the 3:1 non-text floor. */}
              <Icon
                type="refresh"
                color={refresh.ready ? colors.textSecondary : colors.textMuted}
                size={18}
              />
            </Pressable>
            <Pressable
              style={styles.iconButton}
              onPress={() => setSettingsOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Settings"
            >
              <Icon type="settings" color={colors.textSecondary} size={20} />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.statGrid}>
        <View style={styles.statGridRow}>
          <StatTile label="Best streak" value={stat(stats.bestStreak)} accent />
          <StatTile label="Matches" value={stat(stats.games)} />
        </View>
        <View style={styles.statGridRow}>
          <StatTile
            label="Games tried"
            value={loaded ? `${stats.distinctGames}/${GAME_COUNT}` : '-'}
            progress={loaded ? stats.distinctGames / GAME_COUNT : 0}
          />
          <StatTile
            label="Joined"
            value={loaded ? joinedLabel(stats.joinedAt) : '-'}
          />
        </View>
      </View>

      {stats.mostPlayed ? (
        <View style={styles.mostPlayed}>
          <View style={styles.iconTile}>
            <GameIcon type={stats.mostPlayed.gameType} size={22} />
          </View>
          <Text style={styles.mostPlayedText} numberOfLines={1}>
            Most played · <Text style={styles.mostPlayedGame}>
              {GAME_TYPE_LABELS[stats.mostPlayed.gameType]}
            </Text>
          </Text>
          <Text style={styles.mostPlayedCount}>{stats.mostPlayed.matches}</Text>
        </View>
      ) : null}

      <View style={styles.divider} />

      <SectionLabel note={`${unlocked} of ${achievements.length}`}>
        Achievements
      </SectionLabel>
      <View style={styles.badgeRow}>
        {achievements.map(achievement => (
          <View key={achievement.id} style={styles.badgeSlot}>
            <View
              style={[styles.badge, !achievement.unlocked && styles.badgeLocked]}
            >
              <Icon
                type={achievement.unlocked ? ACHIEVEMENT_ICONS[achievement.id] : 'lock'}
                color={achievement.unlocked ? colors.onAccent : colors.textMuted}
                size={24}
              />
            </View>
            <Text style={styles.badgeLabel} numberOfLines={2}>
              {achievement.unlocked ? achievement.label : 'Locked'}
            </Text>
          </View>
        ))}
      </View>

      <Card accent style={styles.referralCard}>
        <View style={styles.referralHead}>
          <View style={styles.referralIcon}>
            <Icon type="users" color={colors.accent200} size={20} />
          </View>
          <View style={styles.referralHeadText}>
            <Text style={styles.referralTitle}>Invite &amp; earn</Text>
            <Text style={styles.referralSubtitle}>
              Earn a share of the fee from every match your invites play.
            </Text>
          </View>
        </View>

        <View style={styles.referralCodeRow}>
          <Pressable
            style={styles.referralCodeBox}
            onPress={handleCopyCode}
            disabled={!shareable}
            accessibilityLabel="Copy referral code"
          >
            <Text style={styles.referralCode} numberOfLines={1}>
              {shareable ?? '-'}
            </Text>
            <Icon
              type={copied ? 'check' : 'copy'}
              color={copied ? colors.accent : colors.textMuted}
              size={16}
            />
          </Pressable>
          <Pressable
            style={styles.shareButton}
            onPress={handleShare}
            disabled={!shareable}
            accessibilityLabel="Share referral"
          >
            <Icon type="share" color={colors.onAccent} size={18} />
          </Pressable>
        </View>

        <View style={styles.referralStats}>
          <View style={styles.statSlot}>
            <Text style={styles.referralStatValue}>{REFERRAL_PLACEHOLDER.invited}</Text>
            <Text style={[type.label, styles.statLabel]}>INVITED</Text>
          </View>
          <View style={styles.statSlot}>
            <Text style={styles.referralStatValue}>{REFERRAL_PLACEHOLDER.matches}</Text>
            <Text style={[type.label, styles.statLabel]}>PLAYED</Text>
          </View>
          <View style={styles.statSlot}>
            <Text style={[styles.referralStatValue, styles.referralEarned]}>
              {REFERRAL_PLACEHOLDER.earned}
            </Text>
            <Text style={[type.label, styles.statLabel]}>EARNED</Text>
          </View>
        </View>
      </Card>

      <SettingsSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        username={username}
        onLogout={logout}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius.xl,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: display.extraBold,
    fontSize: 32,
    color: colors.onAccent,
  },
  identityText: {
    flex: 1,
    gap: spacing.xs,
  },
  username: {
    ...type.title,
    color: colors.textPrimary,
  },
  identityActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  iconButton: {
    width: TAP_TARGET,
    height: TAP_TARGET,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  statGrid: {
    gap: spacing.sm,
  },
  statGridRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statSlot: {
    flex: 1,
  },
  statLabel: {
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  mostPlayed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconTile: {
    width: ICON_TILE,
    height: ICON_TILE,
    borderRadius: radius.sm,
    backgroundColor: colors.accent900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mostPlayedText: {
    ...type.body,
    flex: 1,
    color: colors.textSecondary,
  },
  mostPlayedGame: {
    fontFamily: type.button.fontFamily,
    color: colors.textPrimary,
  },
  mostPlayedCount: {
    fontFamily: mono.bold,
    fontSize: 12,
    color: colors.textMuted,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  badgeSlot: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLocked: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    opacity: 0.6,
  },
  badgeLabel: {
    ...type.caption,
    fontFamily: type.button.fontFamily,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  referralCard: {
    gap: spacing.md,
  },
  referralHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  referralIcon: {
    width: REFERRAL_TILE,
    height: REFERRAL_TILE,
    borderRadius: radius.sm,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralHeadText: {
    flex: 1,
    gap: spacing.xxs,
  },
  referralTitle: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  referralSubtitle: {
    ...type.caption,
    color: colors.textSecondary,
  },
  referralCodeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  referralCodeBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.canvas,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  referralCode: {
    fontFamily: mono.bold,
    fontSize: 14,
    letterSpacing: 1,
    color: colors.textPrimary,
  },
  shareButton: {
    width: TAP_TARGET,
    height: TAP_TARGET,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralStats: {
    flexDirection: 'row',
  },
  referralStatValue: {
    fontFamily: display.extraBold,
    fontSize: 18,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  referralEarned: {
    color: colors.gold,
  },
});
