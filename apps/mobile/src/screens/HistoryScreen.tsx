import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  ApiError,
  STAKE_ASSET_SYMBOLS,
  formatStakeAmount,
  winRate,
  type GameType,
  type MatchHistoryEntry,
} from '@gaming-platform/core';

import { apiClient } from '../api/client';
import Icon from '../components/Icon';
import { useCooldown } from '../hooks/useCooldown';
import { usePlayerStatsStore } from '../store/playerStats.store';
import { useServerStore } from '../store/server.store';
import { SectionLabel, SegmentedTabs, type SegmentedTab } from '../components/ui';
import GameIcon from '../games/GameIcon';
import { GAME_TYPE_LABELS } from '../games/game-type-labels';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';

type Status = 'loading' | 'ready' | 'error';
type Filter = 'all' | 'win' | 'loss';

/** First page size, then how many more we pull on each scroll to the bottom. */
const PAGE_SIZE = 10;
const PAGE_SIZE_MORE = 8;

const ICON_TILE = 40;
/** Win/loss strip: a tall accent bar per win, a short muted one per loss. */
const BAR_WIDTH = 8;
const BAR_TALL = 28;
const BAR_SHORT = 16;
const BAR_COUNT = 6;

const RESULT_META: Record<
  MatchHistoryEntry['result'],
  { label: string; color: string }
> = {
  win: { label: 'WON', color: colors.success },
  loss: { label: 'LOST', color: colors.danger },
  void: { label: 'VOID', color: colors.textMuted },
};

const FILTER_TABS: readonly SegmentedTab<Filter>[] = [
  { value: 'all', label: 'All games' },
  { value: 'win', label: 'Wins' },
  { value: 'loss', label: 'Losses' },
];

const EMPTY_COPY: Record<Filter, { title: string; body: string }> = {
  all: {
    title: 'No matches yet',
    body: 'Your completed games - result, stake and winnings - land here.',
  },
  win: { title: 'No wins yet', body: 'Take a match and it shows up here.' },
  loss: { title: 'No losses', body: 'Nothing lost so far. Keep it that way.' },
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

/** "120 USDC" / "Free" - the stake each player put up. */
function stakeLabel(entry: MatchHistoryEntry): string {
  if (entry.stakeToken === null || !entry.stakeAmount) {
    return 'Free';
  }
  return `${formatStakeAmount(entry.stakeAmount, entry.stakeToken)} ${STAKE_ASSET_SYMBOLS[entry.stakeToken]}`;
}

/** Signed net for the row's right rail ("+228" / "-50"); the token lives in
 *  the meta line, so this stays a bare number. */
function prizeLabel(entry: MatchHistoryEntry): string | null {
  if (entry.stakeToken === null || entry.prizeDelta === null) {
    return null;
  }
  const formatted = formatStakeAmount(entry.prizeDelta, entry.stakeToken);
  if (entry.prizeDelta.startsWith('-') || formatted === '0') {
    return formatted;
  }
  return `+${formatted}`;
}

export default function HistoryScreen() {
  const [entries, setEntries] = useState<MatchHistoryEntry[]>([]);
  const stats = usePlayerStatsStore(state => state.stats);
  const statsLoaded = usePlayerStatsStore(state => state.fetchedAt !== null);
  const loadStats = usePlayerStatsStore(state => state.load);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
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
      void fetchFirstPage();
      // Cached and shared with Profile, so a tab bounce is not a second query.
      void loadStats();
    }, [fetchFirstPage, loadStats]),
  );

  // The list and the counters both come back, so the button is rate-limited.
  const refresh = useCooldown(() => {
    void fetchFirstPage();
    void loadStats({ force: true });
  });

  // The endpoint pages raw matches with no result filter, so Wins/Losses cut
  // the loaded pages client-side.
  const visible = useMemo(
    () => (filter === 'all' ? entries : entries.filter(e => e.result === filter)),
    [entries, filter],
  );

  // A filter can hide every loaded match while later pages still hold some;
  // FlatList never fires onEndReached on an empty list, so pull the next page.
  useEffect(() => {
    if (status === 'ready' && hasMore && entries.length > 0 && visible.length === 0) {
      void loadMore();
    }
  }, [status, hasMore, entries.length, visible.length, loadMore]);

  const decided = stats.wins + stats.losses;
  // Zeroes are the store's cold-start default, not a result - hold the dash
  // until the aggregate has actually arrived.
  const statValue = (value: number) => (statsLoaded ? `${value}` : '-');
  const winRateLabel =
    !statsLoaded || decided === 0 ? '-' : `${winRate(stats)}%`;

  // Newest first from the server; the strip reads left to right in time.
  const recentResults = entries
    .slice(0, BAR_COUNT)
    .map(e => e.result)
    .reverse();

  const renderItem = useCallback(({ item: entry }: { item: MatchHistoryEntry }) => {
    const meta = RESULT_META[entry.result];
    const prize = prizeLabel(entry);
    return (
      <View style={styles.row}>
        <View style={styles.rowIcon}>
          <GameIcon type={entry.gameType as GameType} size={26} />
        </View>
        <View style={styles.rowMid}>
          <View style={styles.rowTitleLine}>
            <Text style={styles.rowGame} numberOfLines={1}>
              {GAME_TYPE_LABELS[entry.gameType as keyof typeof GAME_TYPE_LABELS] ?? 'Match'}
            </Text>
            <Text style={[styles.rowResult, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={styles.rowMeta} numberOfLines={1}>
            vs{' '}
            {entry.opponentUsernames?.length
              ? entry.opponentUsernames.join(', ')
              : (entry.opponentUsername ?? 'Unknown')}{' '}
            · {formatWhen(entry.completedAt)} ·{' '}
            {stakeLabel(entry)}
          </Text>
        </View>
        <Text style={[styles.rowPrize, prize ? { color: meta.color } : null]}>
          {prize ?? '-'}
        </Text>
      </View>
    );
  }, []);

  const listHeader = (
    <View style={styles.headerBlock}>
      <Text style={styles.title}>History</Text>

      <View style={styles.heroRow}>
        <View>
          <Text style={[type.label, styles.heroLabel]}>GAMES PLAYED</Text>
          <Text style={styles.heroValue}>{statValue(stats.games)}</Text>
        </View>
        <View style={styles.barStrip}>
          {recentResults.map((result, index) => (
            <View
              key={`${result}-${index}`}
              style={[
                styles.bar,
                result === 'win' ? styles.barWin : styles.barOther,
              ]}
            />
          ))}
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.statRow}>
        <View style={styles.statSlot}>
          <Text style={[styles.statValue, { color: colors.success }]}>{statValue(stats.wins)}</Text>
          <Text style={[type.label, styles.statLabel]}>WON</Text>
        </View>
        <View style={styles.statSlot}>
          <Text style={[styles.statValue, { color: colors.danger }]}>{statValue(stats.losses)}</Text>
          <Text style={[type.label, styles.statLabel]}>LOST</Text>
        </View>
        <View style={styles.statSlot}>
          <Text style={[styles.statValue, { color: colors.accent }]}>{winRateLabel}</Text>
          <Text style={[type.label, styles.statLabel]}>WIN RATE</Text>
        </View>
      </View>

      <SegmentedTabs tabs={FILTER_TABS} value={filter} onChange={setFilter} />

      <SectionLabel
        action={refresh.ready ? 'Refresh' : `${refresh.secondsLeft}s`}
        onActionPress={refresh.run}
      >
        Recent matches
      </SectionLabel>
    </View>
  );

  const listEmpty =
    status === 'loading' || loadingMore ? (
      <ActivityIndicator color={colors.accent} style={styles.stateBlock} />
    ) : status === 'error' ? (
      <View style={styles.stateBlock}>
        <Icon type="warning" color={colors.textMuted} size={32} />
        <Text style={styles.emptyText}>{errorMessage}</Text>
        <Pressable onPress={() => void fetchFirstPage()}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    ) : (
      <View style={styles.stateBlock}>
        <Icon type="history" color={colors.textMuted} size={32} />
        <Text style={styles.emptyText}>{EMPTY_COPY[filter].title}</Text>
        <Text style={styles.emptySubtext}>{EMPTY_COPY[filter].body}</Text>
      </View>
    );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={visible}
        keyExtractor={item => item.roomId}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        onEndReached={() => void loadMore()}
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

function Separator() {
  return <View style={styles.divider} />;
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
  },
  headerBlock: {
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  title: {
    ...type.title,
    color: colors.textPrimary,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heroLabel: {
    color: colors.textMuted,
  },
  heroValue: {
    fontFamily: display.extraBold,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  barStrip: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xxs,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: radius.sm,
  },
  barWin: {
    height: BAR_TALL,
    backgroundColor: colors.accent,
  },
  barOther: {
    height: BAR_SHORT,
    backgroundColor: colors.borderStrong,
  },
  divider: {
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  statRow: {
    flexDirection: 'row',
  },
  statSlot: {
    // Even columns, so a wide value cannot shove its neighbour's label.
    flex: 1,
  },
  statValue: {
    fontFamily: display.extraBold,
    fontSize: 22,
    lineHeight: 26,
  },
  statLabel: {
    color: colors.textMuted,
    marginTop: spacing.xs,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowIcon: {
    width: ICON_TILE,
    height: ICON_TILE,
    borderRadius: radius.sm,
    backgroundColor: colors.accent900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMid: {
    flex: 1,
    gap: spacing.xxs,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowGame: {
    ...type.subheading,
    flexShrink: 1,
    color: colors.textPrimary,
  },
  rowResult: {
    fontFamily: mono.bold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  rowMeta: {
    fontFamily: mono.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  rowPrize: {
    fontFamily: mono.bold,
    fontSize: 14,
    color: colors.textMuted,
  },
});
