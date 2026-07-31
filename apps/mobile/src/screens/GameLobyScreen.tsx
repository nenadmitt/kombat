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

/** "10 USDC" / "0.01 ETH" / "FREE" for a room's per-player stake. */
function stakeLabel(room: GameRoomSummary): string {
  if (room.stakeToken === null || room.stakeAmount === null) {
    return 'FREE';
  }
  return `${formatStakeAmount(room.stakeAmount, room.stakeToken)} ${STAKE_ASSET_SYMBOLS[room.stakeToken]}`;
}

/** The inline multi-select game chips (stake + token live in the filter sheet).
 *  One entry per MULTIPLAYER_GAME_TYPES member - a missing one hides that
 *  game's rooms behind a filter nobody can select. */
const GAME_FILTERS: { key: GameType; label: string }[] = [
  { key: GameType.NavalBattle, label: 'Battleships' },
  { key: GameType.Ludo, label: 'Ludo' },
  { key: GameType.TripleCut, label: 'Triple Cut' },
  { key: GameType.ChromaClash, label: 'Chroma' },
  { key: GameType.Salvo, label: 'Salvo' },
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
  // "opponent joined" push too), not nested under this Games stack - cast
  // needed since this screen's own nav type doesn't know about it.
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

  // Live lobby: while focused, subscribe to the lobby channel and patch the
  // store as rooms are created / started / cancelled. The store's fetch is
  // TTL-guarded, so switching tabs doesn't re-hit the API. We leave the
  // channel on blur, so nobody off the lobby receives room churn.
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

  // When the multiplayer gate lifts, reconcile with a fresh fetch.
  useEffect(() => {
    if (online) {
      void useLobbyStore.getState().fetch({ force: true });
    }
  }, [online]);

  // Anti-spam manual refresh: WS keeps the list live, this is the fallback.
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
      // navigate's params type is tied to a literal route name; the target
      // is dynamic (per game type), so it can't line up with the specific
      // overload - same pragmatic cast as elsewhere in this file's nav use.
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
      // A multi-seat room can stay Pending after a join (waiting for more):
      // the joiner parks in the waiting popup until game:started arrives.
      // A join that fills the room comes back InProgress and flows on like
      // any other match entry.
      if (
        isMultiSeatGame(room.gameType) &&
        joined.status === GameRoomStatus.Pending
      ) {
        useGameStore.getState().setWaitingRoom(joined, true);
      } else {
        // A staked join only returns once the stakes are held, so there is
        // nothing left to wait for. Waiting on stake:funded here would hang:
        // the event fires before this response arrives.
        enterMatch(room);
      }
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Something went wrong.';
      // An empty stake pot is the one join failure the user can fix right now,
      // so offer the way there instead of a dead-end notice.
      const needsTopUp = /stake pot/i.test(message);
      void confirm({
        title: needsTopUp ? 'Not enough in your pot' : 'Could not join room',
        message,
        icon: needsTopUp ? 'dollar' : 'warning',
        ...(needsTopUp
          ? { confirmLabel: 'Top up' }
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
    // Staked rooms confirm before money moves.
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

  // A code resolved to a room: close the sheet first, then run the normal join
  // flow once it has dismissed. Presenting the staked-confirm sheet while this
  // one is still animating away wedges iOS's modal stack (see the overlay
  // report), so we serialize with a short delay.
  const handleCodeResolved = (room: GameRoomSummary) => {
    setJoinCodeVisible(false);
    setTimeout(() => void handleJoin(room), 350);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Fixed header */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>
            Lobby
          </Text>
          <Chip label="Open games" tone="accent" />
        </View>
      </View>

      <FlatList
        data={online ? rooms : []}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Card style={styles.featured}>
              <Text style={styles.featuredEmpty}>No featured games here</Text>
            </Card>

            {/* Primary actions */}
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

            {/* Filters: multi-select games + a sheet for stake / token. */}
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

            {/* Section header */}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerText: {
    // Keeps the chip to its own width instead of stretching the column.
    alignItems: 'flex-start',
    gap: spacing.xxs,
  },
  name: {
    fontFamily: display.bold,
    fontSize: 26,
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
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  featuredEmpty: {
    fontFamily: mono.medium,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
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
