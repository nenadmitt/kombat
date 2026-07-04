import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ApiError, GameType, type GameRoomSummary } from '@gaming-platform/core';

import { apiClient } from '../api/client';
import { GradientView } from '../components/GradientView';
import Icon from '../components/Icon';
import CreateGameRoomModal from '../games/CreateGameRoomModal';
import { useCurrentUserStore } from '../store/currentUser.store';
import { brandGradient, colors, radius, spacing } from '../theme/colors';
import { fonts } from '../theme/typography';

type Status = 'loading' | 'ready' | 'error';
type Filter = 'all' | GameType;

/** Only real game types get a filter chip / label — no invented games. */
const GAME_TYPE_LABELS: Record<GameType, string> = {
  [GameType.NavalBattle]: 'Battleships',
};

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: GameType.NavalBattle, label: 'Battleships' },
];

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function GameLobyScreen() {
  const username = useCurrentUserStore(state => state.username);

  const [rooms, setRooms] = useState<GameRoomSummary[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  // The list endpoint excludes the user's own room (excludeOwn=true), so it
  // never shows up there — kept separately, from the create response, and
  // only for the current session (no "list my rooms" endpoint exists yet).
  const [myRoom, setMyRoom] = useState<GameRoomSummary | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchRooms = useCallback(async () => {
    setStatus('loading');
    setErrorMessage(null);
    try {
      const pending = await apiClient.listPendingGameRooms({
        excludeOwn: true,
      });
      setRooms(pending);
      setStatus('ready');
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError ? err.message : 'Failed to load game rooms',
      );
      setStatus('error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchRooms();
    }, [fetchRooms]),
  );

  const handleCancelMyRoom = async () => {
    if (!myRoom) {
      return;
    }
    setIsCancelling(true);
    try {
      await apiClient.closeGameRoom(myRoom.id);
      setMyRoom(null);
    } catch {
      // Room may have already started/closed elsewhere — drop the local
      // guess either way so the UI doesn't offer to cancel a stale room.
      setMyRoom(null);
    } finally {
      setIsCancelling(false);
    }
  };

  const filteredRooms =
    filter === 'all' ? rooms : rooms.filter(room => room.gameType === filter);
  const initial = (username ?? '?').charAt(0).toUpperCase();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>Welcome back,</Text>
          <Text style={styles.headline}>Ready to Play?</Text>
        </View>
        <GradientView
          colors={brandGradient.colors}
          positions={brandGradient.positions}
          style={styles.avatar}
        >
          <Text style={styles.avatarInitial}>{initial}</Text>
        </GradientView>
      </View>

      <Pressable
        style={styles.createButtonWrapper}
        onPress={() => setIsCreateModalVisible(true)}
      >
        <GradientView
          colors={brandGradient.colors}
          positions={brandGradient.positions}
          style={styles.createButton}
        >
          <Icon type="plus" color={colors.textPrimary} size={18} />
          <Text style={styles.createButtonText}>Create Game</Text>
        </GradientView>
      </Pressable>

      <FlatList
        data={filteredRooms}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* Not wired up yet — filtering by game name/room comes later. */}
            <View style={styles.searchBar}>
              <Icon type="search" color={colors.textMuted} size={20} />
              <Text style={styles.searchPlaceholder}>Find a game room...</Text>
            </View>

            {myRoom ? (
              <View style={[styles.roomCard, styles.roomCardMine]}>
                <View style={styles.roomRow}>
                  <View style={styles.roomLeft}>
                    <View style={styles.roomIcon}>
                      <Icon type="ship" color={colors.textPrimary} size={22} />
                    </View>
                    <View>
                      <Text style={styles.roomName}>
                        {GAME_TYPE_LABELS[myRoom.gameType]} (Yours)
                      </Text>
                      <Text style={styles.roomSubtext}>
                        Waiting for players · {timeAgo(myRoom.createdAt)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.roomPlayers}>
                    <Text style={styles.playersLabel}>Players</Text>
                    <Text style={styles.playersValue}>
                      {myRoom.playerCount}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={handleCancelMyRoom}
                  disabled={isCancelling}
                  style={styles.cancelRoomButton}
                >
                  <Text style={styles.cancelRoomText}>
                    {isCancelling ? 'Cancelling…' : 'Cancel Room'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.filterRow}>
              {FILTERS.map(f => {
                const active = f.key === filter;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => setFilter(f.key)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={styles.chipText}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Game Rooms</Text>
              <Pressable onPress={fetchRooms} disabled={status === 'loading'}>
                <Text style={styles.refreshText}>Refresh</Text>
              </Pressable>
            </View>

            {status === 'loading' && rooms.length === 0 ? (
              <ActivityIndicator
                color={colors.brandStart}
                style={styles.stateBlock}
              />
            ) : null}

            {status === 'error' ? (
              <View style={styles.stateBlock}>
                <Icon type="warning" color={colors.textMuted} size={32} />
                <Text style={styles.emptyText}>{errorMessage}</Text>
                <Pressable onPress={fetchRooms}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : null}

            {status === 'ready' && filteredRooms.length === 0 ? (
              <View style={styles.stateBlock}>
                <Icon type="ship" color={colors.textMuted} size={32} />
                <Text style={styles.emptyText}>No open game rooms</Text>
                <Text style={styles.emptySubtext}>
                  Create one and wait for an opponent to join.
                </Text>
              </View>
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.roomCard}>
            <View style={styles.roomRow}>
              <View style={styles.roomLeft}>
                <View style={styles.roomIcon}>
                  <Icon type="ship" color={colors.textPrimary} size={22} />
                </View>
                <View>
                  <Text style={styles.roomName}>
                    {GAME_TYPE_LABELS[item.gameType]}
                  </Text>
                  <Text style={styles.roomSubtext}>
                    Waiting for players · {timeAgo(item.createdAt)}
                  </Text>
                </View>
              </View>
              <View style={styles.roomPlayers}>
                <Text style={styles.playersLabel}>Players</Text>
                <Text style={styles.playersValue}>{item.playerCount}</Text>
              </View>
            </View>
          </View>
        )}
      />

      <CreateGameRoomModal
        visible={isCreateModalVisible}
        onClose={() => setIsCreateModalVisible(false)}
        onCreated={room => {
          setMyRoom(room);
          setIsCreateModalVisible(false);
          fetchRooms();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  welcome: {
    fontSize: 14,
    color: colors.textMuted,
  },
  headline: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl * 2,
    gap: spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 6,
    backgroundColor: colors.cardBackground,
    borderRadius: radius.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 6,
    marginBottom: spacing.md,
  },
  searchPlaceholder: {
    fontSize: 15,
    color: colors.textMuted,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  chip: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipActive: {
    backgroundColor: colors.brandStart,
    borderColor: colors.brandStart,
  },
  chipText: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  refreshText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: colors.brandStart,
  },
  stateBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  retryText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: colors.brandStart,
  },
  roomCard: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    padding: spacing.sm + 4,
    gap: spacing.sm,
  },
  roomCardMine: {
    borderColor: colors.kombatAccent,
  },
  cancelRoomButton: {
    alignSelf: 'flex-start',
  },
  cancelRoomText: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: colors.danger,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roomLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  roomIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.chip,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomName: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  roomSubtext: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  roomPlayers: {
    alignItems: 'flex-end',
  },
  playersLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  playersValue: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  createButtonWrapper: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    width: '100%',
    height: 52,
    borderRadius: radius.button,
  },
  createButtonText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
});
