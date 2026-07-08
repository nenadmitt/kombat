import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { ApiError, GameType, type GameRoomSummary } from '@gaming-platform/core';

import { apiClient } from '../api/client';
import Icon from '../components/Icon';
import { Button, Card, Chip } from '../components/ui';
import CreateGameRoomModal from '../games/CreateGameRoomModal';
import { GAME_TYPE_LABELS } from '../games/game-type-labels';
import { GAME_TYPE_SCREENS } from '../games/game-type-screens';
import { formatRoomCode } from '../games/room-code';
import type { RootStackParamList } from '../navigation/types';
import { useCurrentUserStore } from '../store/currentUser.store';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono, type } from '../theme/typography';

type Status = 'loading' | 'ready' | 'error';
type Filter = 'all' | GameType;

/** No staking/prize or balance backend yet — shown for visual parity with the
 *  design until real values exist. */
const HARDCODED_STAKE = '50 USDC';
const MOCK_USD_BALANCE = '4,240';
const FEATURED_POOL = '480';

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

  // No join-by-code backend yet — point players at the open-rooms list.
  const handleJoinGame = () => {
    Alert.alert(
      'Join a game',
      'Tap any open room below to join, or ask a friend to share their room so it shows up here.',
    );
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
                <Pressable onPress={fetchRooms} disabled={status === 'loading'}>
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
            <View style={styles.roomIcon}>
              <Icon type={GAME_ICON} color={colors.accent} size={20} />
            </View>
            <View style={styles.roomInfo}>
              <Text style={styles.roomName}>{GAME_TYPE_LABELS[item.gameType]}</Text>
              <Text style={styles.roomMeta}>
                #{formatRoomCode(item.id)} · {item.playerCount}/2 · {timeAgo(item.createdAt)}
              </Text>
            </View>
            <View style={styles.roomRight}>
              <Text style={styles.roomStake}>{HARDCODED_STAKE}</Text>
              <Button
                label="Join"
                size="sm"
                variant="tinted"
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
