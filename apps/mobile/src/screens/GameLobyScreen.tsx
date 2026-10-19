import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ApiError,
  isMultiSeatGame,
  GameRoomStatus,
  GameType,
  LOBBY_CHANNEL,
  LOBBY_EVENTS,
  STAKE_ASSET_SYMBOLS,
  formatStakeAmount,
  type GameRoomSummary,
  type LobbyRoomRemovedPayload,
} from '@gaming-platform/core';

import { apiClient } from '../api/client';
import Icon from '../components/Icon';
import { Button, Card, Chip, useConfirm } from '../components/ui';
import CreateGameRoomModal from '../games/CreateGameRoomModal';
import JoinByCodeSheet from '../games/JoinByCodeSheet';
import LobbyFilterSheet from '../games/LobbyFilterSheet';
import GameIcon from '../games/GameIcon';
import { GAME_TYPE_LABELS } from '../games/game-type-labels';
import { GAME_TYPE_SCREENS } from '../games/game-type-screens';
import { formatRoomCode } from '../games/room-code';
import type { RootStackParamList } from '../navigation/types';
import { useGameStore } from '../store/game.store';
import { useLobbyStore } from '../store/lobby.store';
import { useServerStore } from '../store/server.store';
import { useWebsocketStore } from '../store/websocket.store';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';

function stakeLabel(room: GameRoomSummary): string {
  if (room.stakeToken === null || room.stakeAmount === null) {
    return 'FREE';
  }
  return `${formatStakeAmount(room.stakeAmount, room.stakeToken)} ${STAKE_ASSET_SYMBOLS[room.stakeToken]}`;
}

/** One entry per MULTIPLAYER_GAME_TYPES member: a missing one hides that game's rooms behind a filter nobody can select. */
const GAME_FILTERS: { key: GameType; label: string }[] = [
  { key: GameType.NavalBattle, label: 'Battleships' },
  { key: GameType.Ludo, label: 'Ludo' },
  { key: GameType.TripleCut, label: 'Triple Cut' },
  { key: GameType.ChromaClash, label: 'Chroma' },
  { key: GameType.Salvo, label: 'Salvo' },
];

const FEATURED_POOL = '480';

const DOT_SIZE = 6;

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function GameLobyScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const confirm = useConfirm();

  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [joinCodeVisible, setJoinCodeVisible] = useState(false);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const rooms = useLobbyStore(s => s.rooms);
  const status = useLobbyStore(s => s.status);
  const storeError = useLobbyStore(s => s.error);
  const filters = useLobbyStore(s => s.filters);
  const setFilters = useLobbyStore(s => s.setFilters);

  const serverStatus = useServerStore(s => s.status);
  const maintenanceMessage = useServerStore(s => s.message);
  const online = serverStatus === 'online';

  useFocusEffect(
    useCallback(() => {
      if (useServerStore.getState().status !== 'online') {
        return;
      }
      const ws = useWebsocketStore.getState();
      void useLobbyStore.getState().fetch();
      ws.joinChannel(LOBBY_CHANNEL);
      const offAdded = ws.on(LOBBY_EVENTS.roomAdded, p =>
        useLobbyStore.getState().applyAdded(p as GameRoomSummary),
      );
      const offRemoved = ws.on(LOBBY_EVENTS.roomRemoved, p =>
        useLobbyStore
          .getState()
          .applyRemoved((p as LobbyRoomRemovedPayload).roomId),
      );
      const offUpdated = ws.on(LOBBY_EVENTS.roomUpdated, p =>
        useLobbyStore.getState().applyUpdated(p as GameRoomSummary),
      );
      return () => {
        offAdded();
        offRemoved();
        offUpdated();
        ws.leaveChannel(LOBBY_CHANNEL);
      };
    }, []),
  );

  useEffect(() => {
    if (online) {
      void useLobbyStore.getState().fetch({ force: true });
    }
  }, [online]);

  const cooldownRef = useRef(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshCooling, setRefreshCooling] = useState(false);

  const requestRefresh = useCallback(() => {
    if (cooldownRef.current || status === 'loading') {
      return;
    }
    cooldownRef.current = true;
    setRefreshCooling(true);
    void useLobbyStore.getState().fetch({ force: true });
    cooldownTimer.current = setTimeout(() => {
      cooldownRef.current = false;
      setRefreshCooling(false);
    }, 2500);
  }, [status]);

  useEffect(
    () => () => {
      if (cooldownTimer.current) {
        clearTimeout(cooldownTimer.current);
      }
    },
    [],
  );

  const refreshDisabled = refreshCooling || status === 'loading';
  const loading = status === 'loading' || status === 'idle';

  const selectedGames = filters.gameTypes ?? [];
  const advancedActive =
    (filters.stake ?? 'all') !== 'all' || !!filters.stakeTokens?.length;

  const toggleGame = (gt: GameType) => {
    const next = selectedGames.includes(gt)
      ? selectedGames.filter(g => g !== gt)
      : [...selectedGames, gt];
    setFilters({ ...filters, gameTypes: next });
  };

  const enterMatch = useCallback(
    (room: GameRoomSummary) => {
      // The route name is dynamic per game type, so it can't match navigate's literal-route overloads.
      (navigation.navigate as (screen: string, params: unknown) => void)(
        GAME_TYPE_SCREENS[room.gameType],
        {
          roomId: room.id,
          stakeToken: room.stakeToken,
          stakeAmount: room.stakeAmount,
        },
      );
    },
    [navigation],
  );

  const joinRoom = async (room: GameRoomSummary) => {
    setJoiningRoomId(room.id);
    try {
      const joined = await apiClient.joinGameRoom(room.id);
      if (
        isMultiSeatGame(room.gameType) &&
        joined.status === GameRoomStatus.Pending
      ) {
        useGameStore.getState().setWaitingRoom(joined, true);
      } else {
        // Don't wait on stake:funded: a staked join returns only once stakes are held, and the event fires before this response.
        enterMatch(room);
      }
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Something went wrong.';
      const needsTopUp = /stake pot/i.test(message);
      void confirm({
        title: needsTopUp ? 'Not enough in your pot' : 'Could not join room',
        message,
        icon: needsTopUp ? 'dollar' : 'warning',
        ...(needsTopUp
          ? { confirmLabel: 'Add funds' }
          : { mode: 'info' as const }),
      }).then(ok => {
        if (ok && needsTopUp) {
          (navigation.navigate as (screen: string, params?: unknown) => void)(
            'MainTabs',
            { screen: 'Wallet' },
          );
        }
      });
    } finally {
      setJoiningRoomId(null);
    }
  };

  const handleJoin = async (room: GameRoomSummary) => {
    if (room.stakeToken === null) {
      void joinRoom(room);
      return;
    }
    const ok = await confirm({
      title: `Join for ${stakeLabel(room)}?`,
      message:
        isMultiSeatGame(room.gameType)
          ? 'Every player puts up the same wager when the match starts. Win and you take the whole pot, minus a small platform fee.'
          : 'Both players put up the same wager. Win the match and you take the pot, minus a small platform fee.',
      confirmLabel: `Stake ${stakeLabel(room)}`,
      icon: 'dollar',
    });
    if (ok) {
      void joinRoom(room);
    }
  };

  const handleJoinGame = () => setJoinCodeVisible(true);

  // Close the sheet first: presenting the staked confirm while it animates away wedges iOS's modal stack.
  const handleCodeResolved = (room: GameRoomSummary) => {
    setJoinCodeVisible(false);
    setTimeout(() => void handleJoin(room), 350);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Lobby</Text>
      </View>

      <FlatList
        data={online ? rooms : []}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Card
              accent
              gradient={{
                colors: [colors.accent900, colors.accent800],
                start: { x: 0, y: 0 },
                end: { x: 1, y: 1 },
              }}
              glow={{ color: colors.accent, size: 150, opacity: 0.4, edge: 0.7, top: -45, right: -35 }}
              style={styles.featured}
            >
              <View style={styles.featuredThumb}>
                <GameIcon type={GameType.NavalBattle} size={38} />
              </View>
              <View style={styles.featuredBody}>
                <View style={styles.featuredEyebrow}>
                  <View style={styles.liveDot} />
                  <Text style={styles.featuredEyebrowText}>Featured · Live</Text>
                </View>
                <Text style={styles.featuredTitle}>Battleships</Text>
                <Text style={styles.featuredPool}>
                  {FEATURED_POOL} <Text style={styles.featuredPoolUnit}>USDC POOL</Text>
                </Text>
              </View>
              <Button
                label="Play"
                size="sm"
                fullWidth={false}
                disabled={!online}
                onPress={() => setIsCreateModalVisible(true)}
              />
            </Card>

            <View style={styles.actionRow}>
              <Button
                label="Create Room"
                icon="plus"
                disabled={!online}
                onPress={() => setIsCreateModalVisible(true)}
                style={styles.actionFlex}
              />
              <Button
                label="Join Game"
                icon="log-out"
                variant="secondary"
                disabled={!online}
                onPress={handleJoinGame}
                style={styles.actionFlex}
              />
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              <Pressable onPress={() => setFilters({ ...filters, gameTypes: [] })}>
                <Chip
                  label="All"
                  tone={selectedGames.length === 0 ? 'accent' : 'outline'}
                />
              </Pressable>
              {GAME_FILTERS.map(f => (
                <Pressable key={String(f.key)} onPress={() => toggleGame(f.key)}>
                  <Chip
                    label={f.label}
                    tone={selectedGames.includes(f.key) ? 'accent' : 'outline'}
                  />
                </Pressable>
              ))}
              <Pressable onPress={() => setFilterSheetVisible(true)}>
                <Chip
                  label="Filters"
                  icon="sliders"
                  tone={advancedActive ? 'accent' : 'outline'}
                />
              </Pressable>
            </ScrollView>

            <View style={styles.sectionHeader}>
              <Text style={[type.label, styles.sectionLabel]}>Open rooms</Text>
              {status === 'ready' ? (
                <Text style={styles.liveCount}>{rooms.length} LIVE</Text>
              ) : (
                <Pressable onPress={requestRefresh} disabled={refreshDisabled}>
                  <Text style={styles.liveCount}>Refresh</Text>
                </Pressable>
              )}
            </View>

            {!online ? (
              <View style={styles.stateBlock}>
                <Icon
                  type={serverStatus === 'offline' ? 'wifi-off' : 'warning'}
                  color={colors.textMuted}
                  size={32}
                />
                <Text style={styles.emptyText}>
                  {serverStatus === 'offline'
                    ? "You're offline"
                    : (maintenanceMessage ?? 'Multiplayer is paused for maintenance')}
                </Text>
                <Text style={styles.emptySubtext}>
                  {serverStatus === 'offline'
                    ? 'Online games are unavailable until the connection is back. Demo games still work.'
                    : 'Check back in a little while. Demo games still work.'}
                </Text>
              </View>
            ) : null}

            {online && loading && rooms.length === 0 ? (
              <ActivityIndicator color={colors.accent} style={styles.stateBlock} />
            ) : null}

            {online && status === 'error' ? (
              <View style={styles.stateBlock}>
                <Icon type="warning" color={colors.textMuted} size={32} />
                <Text style={styles.emptyText}>{storeError}</Text>
                <Pressable onPress={requestRefresh} disabled={refreshDisabled}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : null}

            {online && status === 'ready' && rooms.length === 0 ? (
              <View style={styles.stateBlock}>
                <Icon type="ship" color={colors.textMuted} size={32} />
                <Text style={styles.emptyText}>No open game rooms</Text>
                <Text style={styles.emptySubtext}>
                  Create one and wait for an opponent to join.
                </Text>
                <Button
                  label="Refresh"
                  icon="refresh"
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  onPress={requestRefresh}
                  disabled={refreshDisabled}
                  style={styles.emptyRefresh}
                />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.roomCard}>
            <View style={styles.roomIcon}>
              <GameIcon type={item.gameType} size={34} />
            </View>
            <View style={styles.roomInfo}>
              <Text style={styles.roomName}>{GAME_TYPE_LABELS[item.gameType]}</Text>
              <Text style={styles.roomMeta}>
                #{item.code ?? formatRoomCode(item.id)} · {item.joinedCount}/{item.playerCount} · {timeAgo(item.createdAt)}
              </Text>
            </View>
            <View style={styles.roomRight}>
              <Text style={styles.roomStake}>{stakeLabel(item)}</Text>
              <Button
                label="Join"
                size="sm"
                variant="outline"
                fullWidth={false}
                loading={joiningRoomId === item.id}
                disabled={joiningRoomId !== null}
                onPress={() => void handleJoin(item)}
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

      <JoinByCodeSheet
        visible={joinCodeVisible}
        onClose={() => setJoinCodeVisible(false)}
        onResolved={handleCodeResolved}
      />

      <LobbyFilterSheet
        visible={filterSheetVisible}
        filters={filters}
        onApply={next => {
          setFilters(next);
          setFilterSheetVisible(false);
        }}
        onClose={() => setFilterSheetVisible(false)}
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
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  title: {
    fontFamily: display.bold,
    fontSize: 28,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.sm,
  },
  listHeader: {
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  featured: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featuredThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  featuredEyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  liveDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  featuredEyebrowText: {
    fontFamily: mono.semiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.accentLight,
  },
  featuredTitle: {
    fontFamily: display.bold,
    fontSize: 22,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  featuredPool: {
    fontFamily: mono.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  featuredPoolUnit: {
    fontFamily: mono.medium,
    fontSize: 10,
    color: colors.textMuted,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionFlex: {
    flex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingRight: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    color: colors.textMuted,
  },
  liveCount: {
    fontFamily: mono.bold,
    fontSize: 12,
    letterSpacing: 1,
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
  emptyRefresh: {
    marginTop: spacing.sm,
  },
  retryText: {
    ...type.caption,
    fontFamily: type.button.fontFamily,
    color: colors.accentLight,
  },
  roomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  roomIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.accent900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  roomName: {
    ...type.subheading,
    color: colors.textPrimary,
  },
  roomMeta: {
    fontFamily: mono.regular,
    fontSize: 11,
    color: colors.textMuted,
  },
  roomRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  roomStake: {
    fontFamily: mono.bold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  joinButton: {
    minWidth: 72,
  },
});
