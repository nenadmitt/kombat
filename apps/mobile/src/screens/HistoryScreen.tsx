import { StyleSheet, Text, View } from 'react-native';

import Icon, { type IconName } from '../components/Icon';
import { Card, Chip, Screen, SectionLabel, StatTile, type ChipTone } from '../components/ui';
import { colors, radius, spacing } from '../theme/colors';
import { mono, type } from '../theme/typography';

/** Mocked — no match-history endpoint yet. Values mirror the design reference. */
type MatchResult = 'win' | 'loss' | 'cancelled';

type Match = {
  key: string;
  game: string;
  icon: IconName;
  tint: string;
  opponent: string;
  when: string;
  result: MatchResult;
  stake: string;
  prize: string;
};

const MATCHES: Match[] = [
  { key: '1', game: 'Battleships', icon: 'crosshair', tint: colors.accent, opponent: 'CryptoNinja', when: 'Today 14:20', result: 'win', stake: '10 USDC', prize: '+20 USDC' },
  { key: '2', game: 'Ludo Classic', icon: 'grid', tint: '#38BDF8', opponent: 'BullMarket', when: 'Today 09:15', result: 'loss', stake: '5 USDC', prize: '-5 USDC' },
  { key: '3', game: 'Yahtzee Arena', icon: 'dice', tint: '#FBBF24', opponent: 'WhaleHunter', when: 'Yesterday', result: 'cancelled', stake: '2 USDC', prize: '0 USDC' },
  { key: '4', game: 'Poker High', icon: 'target', tint: '#24E08A', opponent: 'DiamondHands', when: 'Yesterday', result: 'win', stake: '50 USDC', prize: '+100 USDC' },
];

const RESULT_META: Record<MatchResult, { label: string; tone: ChipTone; prizeColor: string }> = {
  win: { label: 'Win', tone: 'success', prizeColor: colors.success },
  loss: { label: 'Loss', tone: 'danger', prizeColor: colors.danger },
  cancelled: { label: 'Cancelled', tone: 'neutral', prizeColor: colors.textMuted },
};

export default function HistoryScreen() {
  return (
    <Screen scroll>
      <Text style={styles.title}>Match History</Text>

      {/* Stat grid */}
      <View style={styles.statGrid}>
        <View style={styles.statRow}>
          <StatTile label="Games played" value="156" />
          <StatTile label="Wins" value="98" valueColor={colors.success} />
        </View>
        <View style={styles.statRow}>
          <StatTile label="Losses" value="58" valueColor={colors.danger} />
          <StatTile label="Win rate" value="62.8%" valueColor={colors.accent} />
        </View>
      </View>

      {/* Total earnings */}
      <View style={styles.earningsCard}>
        <View style={styles.earningsHeader}>
          <Text style={[type.label, styles.earningsLabel]}>Total earnings</Text>
          <Icon type="gem" color={colors.onAccent} size={18} />
        </View>
        <View style={styles.earningsValueRow}>
          <Text style={styles.earningsValue}>+2,450.00</Text>
          <Text style={styles.earningsUnit}>USDC</Text>
        </View>
      </View>

      {/* Recent matches */}
      <View style={styles.section}>
        <SectionLabel>Recent matches</SectionLabel>
        <View style={styles.list}>
          {MATCHES.map(match => {
            const meta = RESULT_META[match.result];
            return (
              <Card key={match.key} style={styles.matchCard}>
                <View style={styles.matchTop}>
                  <View style={[styles.gameIcon, { backgroundColor: match.tint + '22' }]}>
                    <Icon type={match.icon} color={match.tint} size={20} />
                  </View>
                  <View style={styles.matchMid}>
                    <Text style={styles.matchGame}>{match.game}</Text>
                    <Text style={styles.matchMeta}>
                      vs {match.opponent} · {match.when}
                    </Text>
                  </View>
                  <Chip label={meta.label} tone={meta.tone} />
                </View>

                <View style={styles.matchDivider} />

                <View style={styles.matchBottom}>
                  <View style={styles.matchStat}>
                    <Text style={[type.label, styles.matchStatLabel]}>Stake</Text>
                    <Text style={styles.matchStatValue}>{match.stake}</Text>
                  </View>
                  <View style={styles.matchStat}>
                    <Text style={[type.label, styles.matchStatLabel]}>Prize</Text>
                    <Text style={[styles.matchStatValue, { color: meta.prizeColor }]}>
                      {match.prize}
                    </Text>
                  </View>
                  <Icon
                    type="chevron-right"
                    color={colors.textMuted}
                    size={20}
                    style={styles.matchChevron}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    ...type.title,
    color: colors.textPrimary,
  },
  statGrid: {
    gap: spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  earningsCard: {
    backgroundColor: colors.gold,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  earningsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  earningsLabel: {
    color: 'rgba(10, 10, 12, 0.6)',
  },
  earningsValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  earningsValue: {
    fontFamily: mono.bold,
    fontSize: 38,
    letterSpacing: -1,
    color: colors.onAccent,
  },
  earningsUnit: {
    fontFamily: mono.semiBold,
    fontSize: 15,
    color: 'rgba(10, 10, 12, 0.7)',
  },
  section: {
    gap: spacing.sm,
  },
  list: {
    gap: spacing.sm,
  },
  matchCard: {
    gap: spacing.sm,
  },
  matchTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  gameIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchMid: {
    flex: 1,
  },
  matchGame: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  matchMeta: {
    ...type.caption,
    color: colors.textMuted,
  },
  matchDivider: {
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  matchBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  matchStat: {
    gap: 2,
  },
  matchStatLabel: {
    color: colors.textMuted,
  },
  matchStatValue: {
    fontFamily: mono.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  matchChevron: {
    marginLeft: 'auto',
  },
});
