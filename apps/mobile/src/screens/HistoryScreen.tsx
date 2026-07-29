import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  ApiError,
  STAKE_ASSET_SYMBOLS,
  formatStakeAmount,
  type GameType,
  type MatchHistoryEntry,
} from '@gaming-platform/core';

import { apiClient } from '../api/client';
import Icon from '../components/Icon';
import { useServerStore } from '../store/server.store';
import { Card, Chip, SectionLabel, StatTile, type ChipTone } from '../components/ui';
import GameIcon from '../games/GameIcon';
import { GAME_TYPE_LABELS } from '../games/game-type-labels';
import { colors, radius, spacing } from '../theme/colors';
import { mono, type } from '../theme/typography';

type Status = 'loading' | 'ready' | 'error';

/** First page size, then how many more we pull on each scroll to the bottom. */
const PAGE_SIZE = 10;
const PAGE_SIZE_MORE = 8;

const RESULT_META: Record<
  MatchHistoryEntry['result'],
  { label: string; tone: ChipTone; prizeColor: string }
> = {
  win: { label: 'Win', tone: 'success', prizeColor: colors.success },
  loss: { label: 'Loss', tone: 'danger', prizeColor: colors.danger },
  void: { label: 'Voided', tone: 'neutral', prizeColor: colors.textMuted },
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const sameDay = new Date().toDateString() === date.toDateString();
  if (sameDay) {
    const hh = `${date.getHours()}`.padStart(2, '0');
    const mm = `${date.getMinutes()}`.padStart(2, '0');
    return `Today ${hh}:${mm}`;
  }
  return date.toLocaleDateString();
}

/** "+19 USDC" / "-10 USDC" / "FREE" for a history entry. */
function prizeLabel(entry: MatchHistoryEntry): string | null {
  if (entry.stakeToken === null || entry.prizeDelta === null) {
    return null;
  }
  const formatted = formatStakeAmount(entry.prizeDelta, entry.stakeToken);
  const signed = entry.prizeDelta.startsWith('-') || formatted === '0'
    ? formatted
    : `+${formatted}`;
  return `${signed} ${STAKE_ASSET_SYMBOLS[entry.stakeToken]}`;
}

export default function HistoryScreen() {
  const [entries, setEntries] = useState<MatchHistoryEntry[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  /** False once the server returns a short page - nothing more to fetch. */
  const [hasMore, setHasMore] = useState(true);
  /** Guards against overlapping loadMore calls (onEndReached can double-fire). */
  const loadingMoreRef = useRef(false);

  const fetchFirstPage = useCallback(async () => {
    setStatus('loading');
    setErrorMessage(null);
    try {
      const page = await apiClient.getMatchHistory({ limit: PAGE_SIZE });
      setEntries(page);
      setHasMore(page.length === PAGE_SIZE);
      setStatus('ready');
    } catch (err) {
      // History stays uncached by design - offline just shows this failure
      // state; flag the outage so the global banner + lobby gate react too.
      if (err instanceof ApiError && err.isNetworkError) {
        useServerStore.getState().reportOffline();
      }
      setErrorMessage(
        err instanceof ApiError ? err.message : 'Failed to load match history',
      );
      setStatus('error');
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || status !== 'ready') {
      return;
    }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await apiClient.getMatchHistory({
        limit: PAGE_SIZE_MORE,
        offset: entries.length,
      });
      setEntries(prev => [...prev, ...page]);
      setHasMore(page.length === PAGE_SIZE_MORE);
    } catch {
      // Keep what we have; the next scroll retries.
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [entries.length, hasMore, status]);

  useFocusEffect(
    useCallback(() => {
      fetchFirstPage();
    }, [fetchFirstPage]),
  );

  // Stats reflect the matches loaded so far (they grow as you scroll).
  const played = entries.length;
  const wins = entries.filter(e => e.result === 'win').length;
  const losses = entries.filter(e => e.result === 'loss').length;
  const decided = wins + losses;
  const winRateFraction = decided > 0 ? wins / decided : 0;
  const winRate = decided > 0 ? `${((wins / decided) * 100).toFixed(1)}%` : '-';

  const renderItem = useCallback(({ item: entry }: { item: MatchHistoryEntry }) => {
    const meta = RESULT_META[entry.result];
    const prize = prizeLabel(entry);
    return (
      <Card style={styles.matchCard}>
        <View style={styles.matchTop}>
          <View style={styles.gameIcon}>
            <GameIcon type={entry.gameType as GameType} size={34} />
          </View>
          <View style={styles.matchMid}>
            <Text style={styles.matchGame}>
              {GAME_TYPE_LABELS[entry.gameType as keyof typeof GAME_TYPE_LABELS] ?? 'Match'}
            </Text>
            <Text style={styles.matchMeta}>
              vs {entry.opponentUsername ?? 'Unknown'} · {formatWhen(entry.completedAt)}
            </Text>
          </View>
          <Chip label={meta.label} tone={meta.tone} />
        </View>

        <View style={styles.matchDivider} />

        <View style={styles.matchBottom}>
          <View style={styles.matchStat}>
            <Text style={[type.label, styles.matchStatLabel]}>Stake</Text>
            <Text style={styles.matchStatValue}>
              {entry.stakeToken !== null && entry.stakeAmount
                ? `${formatStakeAmount(entry.stakeAmount, entry.stakeToken)} ${STAKE_ASSET_SYMBOLS[entry.stakeToken]}`
                : 'FREE'}
            </Text>
          </View>
          <View style={styles.matchStatDivider} />
          <View style={styles.matchStat}>
            <Text style={[type.label, styles.matchStatLabel]}>Payout</Text>
            <Text style={[styles.matchStatValue, prize ? { color: meta.prizeColor } : null]}>
              {prize ?? '-'}
            </Text>
          </View>
        </View>
      </Card>
    );
  }, []);

  const listHeader = (
    <View style={styles.headerBlock}>
      <Text style={styles.title}>Match History</Text>

      {/* Stat grid (computed from loaded history) */}
      <View style={styles.statGrid}>
        <View style={styles.statRow}>
          <StatTile
            label="Games played"
            value={`${played}`}
            icon="games"
            progress={played > 0 ? 1 : 0}
          />
          <StatTile
            label="Wins"
            value={`${wins}`}
            valueColor={colors.success}
            icon="trophy"
            iconTone={colors.success}
            progress={played > 0 ? wins / played : 0}
          />
        </View>
        <View style={styles.statRow}>
          <StatTile
            label="Losses"
            value={`${losses}`}
            valueColor={colors.danger}
            icon="close"
            iconTone={colors.danger}
            progress={played > 0 ? losses / played : 0}
          />
          <StatTile
            label="Win rate"
            value={winRate}
            icon="trending-up"
            accent
            progress={winRateFraction}
          />
        </View>
      </View>

      <SectionLabel action="Refresh" onActionPress={fetchFirstPage}>
        Recent matches
      </SectionLabel>
    </View>
  );

  const listEmpty =
    status === 'loading' ? (
      <ActivityIndicator color={colors.accent} style={styles.stateBlock} />
    ) : status === 'error' ? (
      <View style={styles.stateBlock}>
        <Icon type="warning" color={colors.textMuted} size={32} />
        <Text style={styles.emptyText}>{errorMessage}</Text>
        <Pressable onPress={fetchFirstPage}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    ) : (
      <View style={styles.stateBlock}>
        <Icon type="history" color={colors.textMuted} size={32} />
        <Text style={styles.emptyText}>No matches yet</Text>
        <Text style={styles.emptySubtext}>
          Your completed games - result, stake and winnings - land here.
        </Text>
      </View>
    );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={entries}
        keyExtractor={item => item.roomId}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.accent} style={styles.footerSpinner} />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.sm,
  },
  headerBlock: {
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
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
  stateBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
  },
  footerSpinner: {
    paddingVertical: spacing.lg,
  },
  emptyText: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  emptySubtext: {
    ...type.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  retryText: {
    ...type.caption,
    fontFamily: type.button.fontFamily,
    color: colors.accentLight,
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
    backgroundColor: colors.accent900,
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
    fontFamily: mono.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  matchDivider: {
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  matchBottom: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  matchStat: {
    flex: 1,
    gap: spacing.xxs,
  },
  matchStatDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.cardBorder,
    marginHorizontal: spacing.md,
  },
  matchStatLabel: {
    color: colors.textMuted,
  },
  matchStatValue: {
    fontFamily: mono.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
});
