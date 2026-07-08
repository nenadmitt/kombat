import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ApiError, GameType, type GameRoomSummary } from '@gaming-platform/core';

import { apiClient } from '../api/client';
import { GradientView } from '../components/GradientView';
import Icon from '../components/Icon';
import CreateGameRoomModal from '../games/CreateGameRoomModal';
import { GAME_ICONS } from '../games/game-icons';
import { GAME_TYPE_LABELS } from '../games/game-type-labels';
import { GAME_TYPE_SCREENS } from '../games/game-type-screens';
import type { RootStackParamList } from '../navigation/types';
import { useCurrentUserStore } from '../store/currentUser.store';
import { brandGradient, colors, radius, spacing } from '../theme/colors';
import { fonts } from '../theme/typography';

type Status = 'loading' | 'ready' | 'error';
type Filter = 'all' | GameType;

/** No staking/prize backend yet — shown for visual parity with the Figma
 *  design until real stakes exist. */
const HARDCODED_STAKE = '50 USDC';

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
  // Battleship is a root-level screen (reachable from the global
  // "opponent joined" push too), not nested under this Games stack — cast
  // needed since this screen's own nav type doesn't know about it.
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const username = useCurrentUserStore(state => state.username);

  const [rooms, setRooms] = useState<GameRoomSummary[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);

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

  const filteredRooms =
    filter === 'all' ? rooms : rooms.filter(room => room.gameType === filter);
  const initial = (username ?? '?').charAt(0).toUpperCase();

  const handleJoin = async (roomId: string, gameType: GameType) => {
    setJoiningRoomId(roomId);
    try {
      await apiClient.joinGameRoom(roomId);
      // navigate's params type is tied to a literal route name; the target
      // is dynamic (per game type), so it can't line up with the specific
      // overload — same pragmatic cast as elsewhere in this file's nav use.
      (navigation.navigate as (screen: string, params: unknown) => void)(
        GAME_TYPE_SCREENS[gameType],
        { roomId },
      );
    } catch (err) {
      Alert.alert(
        'Could not join room',
        err instanceof ApiError ? err.message : 'Something went wrong.',
      );
    } finally {
      setJoiningRoomId(null);
    }
  };

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
                <Image
                  source={GAME_ICONS[item.gameType]}
                  style={styles.roomIcon}
                />
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
            <View style={styles.roomStatsRow}>
              <View>
                <Text style={styles.statLabel}>Stake</Text>
                <Text style={styles.statValue}>{HARDCODED_STAKE}</Text>
              </View>
              <Pressable
                onPress={() => handleJoin(item.id, item.gameType)}
                disabled={joiningRoomId !== null}
              >
                <GradientView
                  colors={brandGradient.colors}
                  positions={brandGradient.positions}
                  style={styles.joinButton}
                >
                  {joiningRoomId === item.id ? (
                    <ActivityIndicator color={colors.textPrimary} size="small" />
                  ) : (
                    <Text style={styles.joinButtonText}>Join</Text>
                  )}
                </GradientView>
              </Pressable>
            </View>
          </View>
        )}
      />

      <CreateGameRoomModal
        visible={isCreateModalVisible}
        onClose={() => setIsCreateModalVisible(false)}
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
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
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
  roomStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  statValue: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.success,
    marginTop: 2,
  },
  joinButton: {
    minWidth: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.chip,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 4,
  },
  joinButtonText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
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
