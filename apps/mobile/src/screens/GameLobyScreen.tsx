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
  GameType,
  STAKE_ASSET_SYMBOLS,
  STAKE_EVENTS,
  formatStakeAmount,
  type GameRoomSummary,
} from '@gaming-platform/core';

import { apiClient } from '../api/client';
import Icon from '../components/Icon';
import { Button, Card, Chip, StakeFundingOverlay, useConfirm } from '../components/ui';
import CreateGameRoomModal from '../games/CreateGameRoomModal';
import JoinByCodeSheet from '../games/JoinByCodeSheet';
import { GAME_TYPE_LABELS } from '../games/game-type-labels';
import { GAME_TYPE_SCREENS } from '../games/game-type-screens';
import { formatRoomCode } from '../games/room-code';
import type { RootStackParamList } from '../navigation/types';
import { useCurrentUserStore } from '../store/currentUser.store';
import { useWebsocketStore } from '../store/websocket.store';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';

type Status = 'loading' | 'ready' | 'error';
type Filter = 'all' | GameType;

/** No balance/pool backend for the header yet - visual parity with the design. */
const MOCK_USD_BALANCE = '4,240';
const FEATURED_POOL = '480';

/** "10 USDC" / "0.01 ETH" / "FREE" for a room's per-player stake. */
function stakeLabel(room: GameRoomSummary): string {
  if (room.stakeToken === null || room.stakeAmount === null) {
    return 'FREE';
  }
  return `${formatStakeAmount(room.stakeAmount, room.stakeToken)} ${STAKE_ASSET_SYMBOLS[room.stakeToken]}`;
}

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
  // "opponent joined" push too), not nested under this Games stack - cast
  // needed since this screen's own nav type doesn't know about it.
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const username = useCurrentUserStore(state => state.username);
  const confirm = useConfirm();

  const [rooms, setRooms] = useState<GameRoomSummary[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [joinCodeVisible, setJoinCodeVisible] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  /** A joined staked room whose escrow is in flight - blocks with an overlay
   *  until the server broadcasts stake:funded / stake:failed. */
  const [fundingRoom, setFundingRoom] = useState<GameRoomSummary | null>(null);
  const onSocketEvent = useWebsocketStore(s => s.on);

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

  // Anti-spam refresh: one tap kicks off a fetch, then the control is on a
  // short cooldown so it can't be hammered (a burst of taps costs one request).
  const cooldownRef = useRef(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshCooling, setRefreshCooling] = useState(false);

  const requestRefresh = useCallback(() => {
    if (cooldownRef.current || status === 'loading') {
      return;
    }
    cooldownRef.current = true;
    setRefreshCooling(true);
    fetchRooms();
    cooldownTimer.current = setTimeout(() => {
      cooldownRef.current = false;
      setRefreshCooling(false);
    }, 2500);
  }, [fetchRooms, status]);

  useEffect(
    () => () => {
      if (cooldownTimer.current) {
        clearTimeout(cooldownTimer.current);
      }
    },
    [],
  );

  const refreshDisabled = refreshCooling || status === 'loading';

  const filteredRooms =
    filter === 'all' ? rooms : rooms.filter(room => room.gameType === filter);
  const initial = (username ?? '?').charAt(0).toUpperCase();

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

  // While a joined staked room is funding, wait for the escrow verdict.
  useEffect(() => {
    if (!fundingRoom) {
      return;
    }
    const offFunded = onSocketEvent(STAKE_EVENTS.funded, payload => {
      if ((payload as { roomId?: string }).roomId !== fundingRoom.id) {
        return;
      }
      // Dismiss the funding overlay first, then navigate once it has fully
      // faded out. Pushing the match screen while a transparent Modal is
      // still mid-dismiss wedges iOS's presentation stack - the classic
      // "I can see the screen but nothing is tappable" freeze.
      const room = fundingRoom;
      setFundingRoom(null);
      setTimeout(() => enterMatch(room), 350);
    });
    const offFailed = onSocketEvent(STAKE_EVENTS.failed, payload => {
      const p = payload as { roomId?: string; reason?: string };
      if (p.roomId !== fundingRoom.id) {
        return;
      }
      setFundingRoom(null);
      fetchRooms();
      // Let the funding overlay finish dismissing before presenting the
      // notice sheet - overlapping Modal transitions wedge iOS touches.
      setTimeout(() => {
        void confirm({
          title: 'Stakes could not be secured',
          message: p.reason ?? 'The match was voided.',
          icon: 'warning',
          mode: 'info',
        });
      }, 500);
    });
    return () => {
      offFunded();
      offFailed();
    };
  }, [fundingRoom, onSocketEvent, enterMatch, fetchRooms, confirm]);

  const joinRoom = async (room: GameRoomSummary) => {
    setJoiningRoomId(room.id);
    try {
      await apiClient.joinGameRoom(room.id);
      if (room.stakeToken !== null) {
        // Staked: the server is escrowing both stakes - hold here until the
        // stake:funded event; the match is gated server-side anyway.
        setFundingRoom(room);
      } else {
        enterMatch(room);
      }
    } catch (err) {
      void confirm({
        title: 'Could not join room',
        message: err instanceof ApiError ? err.message : 'Something went wrong.',
        icon: 'warning',
        mode: 'info',
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
        'Both players put up the same wager. Win the match and you take the pot, minus a small platform fee.',
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
          <Text style={[type.label, styles.welcome]}>Welcome back</Text>
          <Text style={styles.name} numberOfLines={1}>
            {username ?? 'Player'}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.balancePill}>
            <Icon type="gem" color={colors.accent} size={14} />
            <Text style={styles.balanceValue}>{MOCK_USD_BALANCE}</Text>
            <Text style={styles.balanceUnit}>USD</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={filteredRooms}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            {/* Featured game */}
            <Card accent style={styles.featured}>
              <View style={styles.featuredThumb}>
                <Icon type={GAME_ICON} color={colors.accent} size={30} />
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
                onPress={() => setIsCreateModalVisible(true)}
              />
            </Card>

            {/* Primary actions */}
            <View style={styles.actionRow}>
              <Button
                label="Create Room"
                icon="plus"
                onPress={() => setIsCreateModalVisible(true)}
                style={styles.actionFlex}
              />
              <Button
                label="Join Game"
                icon="log-out"
                variant="secondary"
                onPress={handleJoinGame}
                style={styles.actionFlex}
              />
            </View>

            {/* Filters */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              {FILTERS.map(f => (
                <Pressable key={String(f.key)} onPress={() => setFilter(f.key)}>
                  <Chip label={f.label} tone={f.key === filter ? 'accent' : 'outline'} />
                </Pressable>
              ))}
            </ScrollView>

            {/* Section header */}
            <View style={styles.sectionHeader}>
              <Text style={[type.label, styles.sectionLabel]}>Open rooms</Text>
              {status === 'ready' ? (
                <Text style={styles.liveCount}>{filteredRooms.length} LIVE</Text>
              ) : (
                <Pressable onPress={requestRefresh} disabled={refreshDisabled}>
                  <Text style={styles.liveCount}>Refresh</Text>
                </Pressable>
              )}
            </View>

            {status === 'loading' && rooms.length === 0 ? (
              <ActivityIndicator color={colors.accent} style={styles.stateBlock} />
            ) : null}

            {status === 'error' ? (
              <View style={styles.stateBlock}>
                <Icon type="warning" color={colors.textMuted} size={32} />
                <Text style={styles.emptyText}>{errorMessage}</Text>
                <Pressable onPress={requestRefresh} disabled={refreshDisabled}>
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
              <Icon type={GAME_ICON} color={colors.accent} size={20} />
            </View>
            <View style={styles.roomInfo}>
              <Text style={styles.roomName}>{GAME_TYPE_LABELS[item.gameType]}</Text>
              <Text style={styles.roomMeta}>
                #{item.code ?? formatRoomCode(item.id)} · {item.playerCount}/2 · {timeAgo(item.createdAt)}
              </Text>
            </View>
            <View style={styles.roomRight}>
              <Text style={styles.roomStake}>{stakeLabel(item)}</Text>
              <Button
                label="Join"
                size="sm"
                variant="tinted"
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

      {/* Staked-join "getting ready" overlay (funny, no on-chain wording). */}
      <StakeFundingOverlay
        visible={fundingRoom !== null}
        subtitle={fundingRoom ? `${stakeLabel(fundingRoom)} on the line` : undefined}
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
  headerText: {
    flex: 1,
    gap: 2,
  },
  welcome: {
    color: colors.textMuted,
  },
  name: {
    fontFamily: display.bold,
    fontSize: 26,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  balanceValue: {
    fontFamily: mono.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  balanceUnit: {
    fontFamily: mono.medium,
    fontSize: 10,
    color: colors.textMuted,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: display.bold,
    fontSize: 18,
    color: colors.onAccent,
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
    gap: 2,
  },
  featuredEyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
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
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomInfo: {
    flex: 1,
    gap: 2,
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
