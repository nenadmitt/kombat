import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
import Icon from '../components/Icon';
import { Button, Card, Chip } from '../components/ui';
import CreateGameRoomModal from '../games/CreateGameRoomModal';
import { GAME_TYPE_LABELS } from '../games/game-type-labels';
import { GAME_TYPE_SCREENS } from '../games/game-type-screens';
import type { RootStackParamList } from '../navigation/types';
import { useCurrentUserStore } from '../store/currentUser.store';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';

type Status = 'loading' | 'ready' | 'error';
type Filter = 'all' | GameType;

/** No staking/prize backend yet — shown for visual parity with the design
 *  until real stakes exist. */
const HARDCODED_STAKE = '50 USDC';

const GAME_ICON = 'crosshair' as const;

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
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.welcome}>Welcome back,</Text>
          <Text style={styles.headline}>Ready to Play?</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
      </View>

      <View style={styles.createWrap}>
        <Button
          label="Create Game"
          icon="plus"
          onPress={() => setIsCreateModalVisible(true)}
        />
      </View>

      <FlatList
        data={filteredRooms}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            {/* Not wired up yet — filtering by game name/room comes later. */}
            <View style={styles.searchBar}>
              <Icon type="search" color={colors.textMuted} size={20} />
              <Text style={styles.searchPlaceholder}>Find a game room…</Text>
            </View>

            <View style={styles.filterRow}>
              {FILTERS.map(f => (
                <Pressable key={String(f.key)} onPress={() => setFilter(f.key)}>
                  <Chip
                    label={f.label}
                    tone={f.key === filter ? 'accent' : 'outline'}
                    uppercase={false}
                  />
                </Pressable>
              ))}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={[type.label, styles.sectionLabel]}>Game rooms</Text>
              <Pressable onPress={fetchRooms} disabled={status === 'loading'}>
                <Text style={styles.refreshText}>Refresh</Text>
              </Pressable>
            </View>

            {status === 'loading' && rooms.length === 0 ? (
              <ActivityIndicator color={colors.accent} style={styles.stateBlock} />
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
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.roomCard}>
            <View style={styles.roomRow}>
              <View style={styles.roomLeft}>
                <View style={styles.roomIcon}>
                  <Icon type={GAME_ICON} color={colors.accent} size={22} />
                </View>
                <View style={styles.roomInfo}>
                  <Text style={styles.roomName}>
                    {GAME_TYPE_LABELS[item.gameType]}
                  </Text>
                  <Text style={styles.roomSubtext}>
                    Waiting · {timeAgo(item.createdAt)}
                  </Text>
                </View>
              </View>
              <View style={styles.roomPlayers}>
                <Text style={[type.label, styles.playersLabel]}>Players</Text>
                <Text style={styles.playersValue}>{item.playerCount}/2</Text>
              </View>
            </View>

            <View style={styles.roomDivider} />

            <View style={styles.roomStatsRow}>
              <View>
                <Text style={[type.label, styles.statLabel]}>Stake</Text>
                <Text style={styles.statValue}>{HARDCODED_STAKE}</Text>
              </View>
              <Button
                label="Join"
                size="sm"
                fullWidth={false}
                loading={joiningRoomId === item.id}
                disabled={joiningRoomId !== null}
                onPress={() => handleJoin(item.id, item.gameType)}
                style={styles.joinButton}
              />
            </View>
          </Card>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  welcome: {
    ...type.caption,
    color: colors.textMuted,
  },
  headline: {
    fontFamily: display.bold,
    fontSize: 26,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: display.bold,
    fontSize: 20,
    color: colors.onAccent,
  },
  createWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.sm,
  },
  listHeader: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  searchPlaceholder: {
    fontFamily: mono.regular,
    fontSize: 14,
    color: colors.textMuted,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    color: colors.textMuted,
  },
  refreshText: {
    ...type.caption,
    fontFamily: type.button.fontFamily,
    color: colors.accentLight,
  },
  stateBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xxl,
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
  roomCard: {
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
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomInfo: {
    flexShrink: 1,
  },
  roomName: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  roomSubtext: {
    ...type.caption,
    color: colors.textMuted,
  },
  roomPlayers: {
    alignItems: 'flex-end',
    gap: 2,
  },
  playersLabel: {
    color: colors.textMuted,
  },
  playersValue: {
    fontFamily: mono.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  roomDivider: {
    height: 1,
    backgroundColor: colors.cardBorder,
  },
  roomStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statLabel: {
    color: colors.textMuted,
  },
  statValue: {
    fontFamily: mono.bold,
    fontSize: 15,
    color: colors.success,
    marginTop: 2,
  },
  joinButton: {
    minWidth: 84,
  },
});
