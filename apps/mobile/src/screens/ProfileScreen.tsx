import { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  GameType,
  achievementsFor,
  emptyPlayerStats,
  type AchievementId,
  type PlayerStats,
} from '@gaming-platform/core';

import { apiClient } from '../api/client';
import Icon, { type IconName } from '../components/Icon';
import SettingsSheet from '../components/profile/SettingsSheet';
import { AddressPill, Card, Screen, SectionLabel } from '../components/ui';
import GameIcon from '../games/GameIcon';
import { GAME_TYPE_LABELS } from '../games/game-type-labels';
import { useCurrentUserStore } from '../store/currentUser.store';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';

/** Badge glyphs. The badges themselves are derived from real stats in core. */
const ACHIEVEMENT_ICONS: Record<AchievementId, IconName> = {
  'first-blood': 'target',
  'top-gun': 'trophy',
  veteran: 'shield',
  whale: 'crown',
};

/**
 * Placeholders. `/users/me/stats` carries games/wins/losses/voids/net/referrals
 * and nothing else, so the rest of the design's numbers have no source yet.
 */
const PLACEHOLDER = {
  bestStreak: 12,
  distinctGames: 5,
  joinedDays: 92,
  mostPlayed: GameType.NavalBattle,
  mostPlayedCount: 64,
  referralMatches: 386,
  referralEarned: '$48.20',
} as const;

const AVATAR = 76;
const GEAR = 40;
const BADGE = 52;
const ICON_TILE = 32;

export default function ProfileScreen() {
  const username = useCurrentUserStore(state => state.username);
  const referralCode = useCurrentUserStore(state => state.referralCode);
  const wallet = useCurrentUserStore(state => state.wallet);
  const logout = useCurrentUserStore(state => state.logout);

  // Stats are a lifetime aggregate from the server - never derived from the
  // paginated history feed, which only ever sees one page.
  const [stats, setStats] = useState<PlayerStats>(emptyPlayerStats);
  const [copied, setCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    apiClient
      .getMyStats()
      .then(s => {
        if (alive) {
          setStats(s);
        }
      })
      // A stats failure leaves the zeroed defaults rather than blocking the
      // whole profile; everything else here is local.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

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

  const handleCopyAddress = useCallback(() => {
    if (wallet) {
      Clipboard.setString(wallet.address);
    }
  }, [wallet]);

  const handleShare = useCallback(() => {
    if (!shareable) {
      return;
    }
    Share.share({
      message: `Play KryptoKombat with me - use my code ${shareable} when you sign up.`,
    }).catch(() => {
      // User dismissed the share sheet; nothing to do.
    });
  }, [shareable]);

  const headlineStats = [
    { key: 'streak', value: `${PLACEHOLDER.bestStreak}`, label: 'BEST STREAK', accent: true },
    { key: 'matches', value: `${stats.games}`, label: 'MATCHES', accent: false },
    { key: 'games', value: `${PLACEHOLDER.distinctGames}`, label: 'GAMES', accent: false },
    { key: 'joined', value: `${PLACEHOLDER.joinedDays}d`, label: 'JOINED', accent: false },
  ];

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
          {wallet ? (
            <AddressPill address={wallet.address} onPress={handleCopyAddress} />
          ) : null}
        </View>
        <Pressable
          style={styles.gear}
          onPress={() => setSettingsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Icon type="settings" color={colors.textSecondary} size={20} />
        </Pressable>
      </View>

      <View style={styles.divider} />

      <View style={styles.statRow}>
        {headlineStats.map(stat => (
          <View key={stat.key}>
            <Text
              style={[styles.statValue, stat.accent ? { color: colors.accent } : null]}
            >
              {stat.value}
            </Text>
            <Text style={[type.label, styles.statLabel]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.mostPlayed}>
        <View style={styles.iconTile}>
          <GameIcon type={PLACEHOLDER.mostPlayed} size={22} />
        </View>
        <Text style={styles.mostPlayedText} numberOfLines={1}>
          Most played · <Text style={styles.mostPlayedGame}>
            {GAME_TYPE_LABELS[PLACEHOLDER.mostPlayed]}
          </Text>
        </Text>
        <Text style={styles.mostPlayedCount}>{PLACEHOLDER.mostPlayedCount}</Text>
      </View>

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
            <Text style={styles.badgeLabel} numberOfLines={1}>
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
          <View>
            <Text style={styles.referralStatValue}>{stats.referrals}</Text>
            <Text style={[type.label, styles.statLabel]}>INVITED</Text>
          </View>
          <View>
            <Text style={styles.referralStatValue}>{PLACEHOLDER.referralMatches}</Text>
            <Text style={[type.label, styles.statLabel]}>THEIR MATCHES</Text>
          </View>
          <View>
            <Text style={[styles.referralStatValue, styles.referralEarned]}>
              {PLACEHOLDER.referralEarned}
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
  gear: {
    width: GEAR,
    height: GEAR,
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
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statValue: {
    fontFamily: display.extraBold,
    fontSize: 22,
    lineHeight: 26,
    color: colors.textPrimary,
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
    width: GEAR,
    height: GEAR,
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
    width: GEAR,
    height: GEAR,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
