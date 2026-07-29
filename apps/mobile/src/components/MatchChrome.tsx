import { Pressable, StyleSheet, Text, View } from 'react-native';

import Icon from './Icon';
import TurnTimer from '../games/battleship/game/TurnTimer';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono } from '../theme/typography';

/**
 * The chrome every match screen wears: the back / title header and the
 * "you vs them" bar with the shared turn clock between them. Lifted verbatim
 * from the Battleship screen so a new game never invents its own.
 */

type HeaderProps = {
  /** Small uppercase kicker, e.g. "RANKED MATCH". */
  label: string;
  title: string;
  onBack: () => void;
  onMenu?: () => void;
};

export function MatchHeader({ label, title, onBack, onMenu }: HeaderProps) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.headerButton} onPress={onBack}>
        <Icon type="chevron-left" color={colors.textPrimary} size={20} />
      </Pressable>
      <View style={styles.headerCenter}>
        <Text style={styles.headerLabel}>{label}</Text>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <Pressable style={styles.headerButton} onPress={onMenu}>
        <Icon type="more-horizontal" color={colors.textPrimary} size={20} />
      </Pressable>
    </View>
  );
}

export type MatchPlayer = {
  initial: string;
  name: string;
  /** Second line under the name - whatever the game counts. */
  sub: string;
  online?: boolean;
};

type PlayerBarProps = {
  me: MatchPlayer;
  opponent: MatchPlayer;
  myTurn: boolean;
  /** Epoch ms the current turn ends (null outside an active turn). */
  turnDeadline: number | null;
  onTimerExpire?: () => void;
};

export function MatchPlayerBar({
  me,
  opponent,
  myTurn,
  turnDeadline,
  onTimerExpire,
}: PlayerBarProps) {
  return (
    <View style={styles.playerBar}>
      <View style={styles.playerSide}>
        <View style={[styles.avatar, styles.avatarYou]}>
          <Text style={styles.avatarText}>{me.initial}</Text>
          {me.online !== undefined && (
            <View
              style={[
                styles.presenceDot,
                { backgroundColor: me.online ? colors.success : colors.danger },
              ]}
            />
          )}
        </View>
        <View style={styles.playerTextWrap}>
          <Text style={styles.playerName} numberOfLines={1}>
            {me.name}
          </Text>
          <Text style={styles.playerSub}>{me.sub}</Text>
        </View>
      </View>

      <View style={styles.turnBox}>
        <TurnTimer
          deadline={turnDeadline}
          onExpire={onTimerExpire}
          style={styles.turnTimer}
        />
        <Text style={styles.turnLabel}>{myTurn ? 'YOUR TURN' : 'THEIR TURN'}</Text>
      </View>

      <View style={[styles.playerSide, styles.playerSideRight]}>
        <View style={styles.playerRightText}>
          <Text style={styles.playerName} numberOfLines={1}>
            {opponent.name}
          </Text>
          <Text style={styles.playerSub}>{opponent.sub}</Text>
        </View>
        <View style={[styles.avatar, styles.avatarEnemy]}>
          <Text style={styles.avatarText}>{opponent.initial}</Text>
          {opponent.online !== undefined && (
            <View
              style={[
                styles.presenceDot,
                {
                  backgroundColor: opponent.online ? colors.success : colors.danger,
                },
              ]}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 10,
    fontFamily: mono.medium,
    color: colors.textMuted,
    letterSpacing: 1.5,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: display.bold,
    color: colors.textPrimary,
    marginTop: 1,
  },
  playerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    padding: spacing.sm,
  },
  playerSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  playerSideRight: {
    justifyContent: 'flex-end',
  },
  playerTextWrap: {
    flexShrink: 1,
  },
  playerRightText: {
    alignItems: 'flex-end',
    flexShrink: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presenceDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.background,
  },
  avatarYou: {
    backgroundColor: colors.brandStart,
  },
  avatarEnemy: {
    backgroundColor: colors.surfaceMuted,
  },
  avatarText: {
    fontSize: 16,
    fontFamily: display.bold,
    color: colors.textPrimary,
  },
  playerName: {
    fontSize: 14,
    fontFamily: display.semiBold,
    color: colors.textPrimary,
  },
  playerSub: {
    fontSize: 11,
    color: colors.textMuted,
  },
  turnBox: {
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brandStart,
  },
  turnTimer: {
    fontSize: 15,
    fontFamily: mono.bold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  turnLabel: {
    fontSize: 8,
    fontFamily: mono.bold,
    color: colors.accent,
    letterSpacing: 1,
  },
});
