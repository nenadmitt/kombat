import { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { Canvas, Circle, SweepGradient, vec } from '@shopify/react-native-skia';
import {
  STAKE_ASSET_SYMBOLS,
  StakeAsset,
  achievementsFor,
  emptyPlayerStats,
  formatStakeAmount,
  levelForGames,
  winRate,
  type AchievementId,
  type PlayerStats,
} from '@gaming-platform/core';

import { apiClient } from '../api/client';
import Icon, { type IconName } from '../components/Icon';
import {
  AddressPill,
  Button,
  Card,
  Screen,
  SectionLabel,
  useConfirm,
} from '../components/ui';
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
 * Settings rows. Each is informational for now - none of these subsystems
 * exists yet, so rather than a dead tap they open a sheet that says what the
 * row will do. `useConfirm` is the app-wide single Modal, so this can never
 * stack a second one (see CLAUDE.md rule 5).
 */
const SETTINGS_ROWS = [
  {
    key: 'notifications',
    icon: 'bell' as IconName,
    label: 'Notifications',
    body: 'Push notifications are not configurable yet. Today you get alerts when an opponent joins your room and when a match you are in needs your turn.',
  },
  {
    key: 'security',
    icon: 'shield' as IconName,
    label: 'Security & Wallet',
    body: 'Your wallet key is generated on this device and stored in the iOS Keychain / Android Keystore. It never leaves the device and is never sent to our servers. Back up your recovery phrase from the Wallet tab.',
  },
  {
    key: 'help',
    icon: 'help' as IconName,
    label: 'Help & Support',
    body: 'Need a hand? Email support@playkombat.xyz with your username and, if it is about a specific match, the room code. We answer within a couple of days.',
  },
  {
    key: 'terms',
    icon: 'file-text' as IconName,
    label: 'Terms of Service',
    body: 'By playing you agree that staked matches are wagers of real assets, that results are final once settled on-chain, and that you are responsible for complying with the laws where you live. Full terms ship before public launch.',
  },
] as const;

/** Shorten a display amount so the stat chip stays on one line ("4231.55"
 *  -> "4.2k"). Display only - never used for anything that must be exact. */
function compactAmount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  if (abs >= 100) {
    return value.toFixed(0);
  }
  return value.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Net winnings headline: the asset the player has swung most on. The symbol
 * rides in the chip's label rather than its value, so a big number stays on
 * one line the way the design's "$4.2k" does.
 */
function earnedStat(stats: PlayerStats): { value: string; label: string } {
  const entries = Object.entries(stats.netByToken) as [string, string][];
  if (entries.length === 0) {
    return { value: '-', label: 'Earned' };
  }
  // Biggest absolute swing wins the headline slot.
  const [token, net] = entries.reduce((best, entry) => {
    const a = BigInt(entry[1]) < 0n ? -BigInt(entry[1]) : BigInt(entry[1]);
    const b = BigInt(best[1]) < 0n ? -BigInt(best[1]) : BigInt(best[1]);
    return a > b ? entry : best;
  });
  const asset = Number(token) as StakeAsset;
  const sign = BigInt(net) > 0n ? '+' : '';
  const amount = compactAmount(Number(formatStakeAmount(net, asset)));
  return {
    value: `${sign}${amount}`,
    label: `${STAKE_ASSET_SYMBOLS[asset]} earned`,
  };
}

export default function ProfileScreen() {
  const username = useCurrentUserStore(state => state.username);
  const wallet = useCurrentUserStore(state => state.wallet);
  const referralCode = useCurrentUserStore(state => state.referralCode);
  const logout = useCurrentUserStore(state => state.logout);
  const confirm = useConfirm();

  // Stats are a lifetime aggregate from the server - never derived from the
  // paginated history feed, which only ever sees one page.
  const [stats, setStats] = useState<PlayerStats>(emptyPlayerStats);
  const [copied, setCopied] = useState(false);

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
  const level = levelForGames(stats.games);
  const achievements = achievementsFor(stats);
  const shareable = referralCode ?? null;

  const handleCopy = useCallback(() => {
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
      // User dismissed the share sheet; nothing to do.
    });
  }, [shareable]);

  const statChips = [
    { value: `${stats.games}`, label: 'Games' },
    { value: stats.wins + stats.losses > 0 ? `${winRate(stats)}%` : '-', label: 'Win rate' },
    earnedStat(stats),
  ];

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
          <Text style={styles.levelText}>LVL {level}</Text>
        </View>
      </View>
      <Text style={styles.username}>{username ?? 'Player'}</Text>
      {wallet ? <AddressPill address={wallet.address} /> : null}

      {/* Mini stats */}
      <View style={[styles.statsRow, styles.block]}>
        {statChips.map(stat => (
          <View key={stat.label} style={styles.statChip}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={[type.label, styles.statLabel]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Achievements - derived from the lifetime record, locked ones dimmed. */}
      <SectionLabel style={styles.block}>Achievements</SectionLabel>
      <View style={[styles.achievementsRow, styles.block]}>
        {achievements.map(achievement => (
          <Card
            key={achievement.id}
            style={[
              styles.achievementCard,
              !achievement.unlocked && styles.achievementLocked,
            ]}
            onPress={() =>
              void confirm({
                title: achievement.label,
                message: achievement.unlocked
                  ? 'Earned.'
                  : achievement.requirement,
                icon: ACHIEVEMENT_ICONS[achievement.id],
                mode: 'info',
              })
            }
          >
            <View
              style={[
                styles.achievementIcon,
                !achievement.unlocked && styles.achievementIconLocked,
              ]}
            >
              <Icon
                type={achievement.unlocked ? ACHIEVEMENT_ICONS[achievement.id] : 'lock'}
                color={achievement.unlocked ? colors.onAccent : colors.textMuted}
                size={20}
              />
            </View>
            <Text style={styles.achievementLabel}>{achievement.label}</Text>
          </Card>
        ))}
      </View>

      {/* Referral */}
      <Card accent style={[styles.referralCard, styles.block]}>
        <Text style={styles.referralTitle}>Invite &amp; Earn</Text>
        <Text style={styles.referralSubtitle}>
          {stats.referrals > 0
            ? `${stats.referrals} ${stats.referrals === 1 ? 'player has' : 'players have'} joined with your code.`
            : 'Get 5% of entry fees from referrals.'}
        </Text>
        <View style={styles.referralRow}>
          <Pressable
            style={styles.referralCodeBox}
            onPress={handleCopy}
            disabled={!shareable}
            accessibilityLabel="Copy referral code"
          >
            <Text style={styles.referralCode}>{shareable ?? '-'}</Text>
            <Icon
              type={copied ? 'check' : 'copy'}
              color={copied ? colors.accent : colors.textMuted}
              size={14}
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
      </Card>

      {/* Settings */}
      <View style={[styles.settingsList, styles.block]}>
        {SETTINGS_ROWS.map(row => (
          <Card
            key={row.key}
            onPress={() =>
              void confirm({
                title: row.label,
                message: row.body,
                icon: row.icon,
                mode: 'info',
              })
            }
            style={styles.settingsRow}
          >
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
    // Four badges: two per row rather than four squeezed across, which
    // truncates the longer labels on a narrow screen.
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  achievementLocked: {
    opacity: 0.45,
  },
  achievementIconLocked: {
    backgroundColor: colors.surfaceMuted,
  },
  achievementCard: {
    flexBasis: '47%',
    flexGrow: 1,
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
