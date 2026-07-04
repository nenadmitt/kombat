import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '../components/Icon';
import { useGameStore } from '../store/game.store';
import { colors, radius, spacing } from '../theme/colors';
import { fonts } from '../theme/typography';
import { GAME_ICONS } from './game-icons';
import { formatRoomCode } from './room-code';

/**
 * Slim bar shown instead of the full popup once minimized. Pinned near the
 * top, above whatever tab is currently active (see MainTabsWithGameOverlay).
 */
export default function WaitingForPlayersMinimizedBar() {
  const insets = useSafeAreaInsets();
  const waitingRoom = useGameStore(state => state.waitingRoom);
  const isMinimized = useGameStore(state => state.isMinimized);
  const expand = useGameStore(state => state.expand);

  if (!waitingRoom || !isMinimized) {
    return null;
  }

  return (
    <View
      style={[styles.wrapper, { top: insets.top }]}
      pointerEvents="box-none"
    >
      <Pressable style={styles.bar} onPress={expand}>
        <Image source={GAME_ICONS[waitingRoom.gameType]} style={styles.icon} />
        <View style={styles.textGroup}>
          <Text style={styles.title}>Waiting for Players...</Text>
          <Text style={styles.subtitle}>
            ROOM: #{formatRoomCode(waitingRoom.id)}
          </Text>
        </View>
        <Icon type="chevron-up" color={colors.textMuted} size={18} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    zIndex: 10,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm - 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  textGroup: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: colors.textMuted,
  },
});
