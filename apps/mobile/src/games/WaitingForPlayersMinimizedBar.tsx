import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '../components/Icon';
import { useGameStore } from '../store/game.store';
import { colors, radius, spacing } from '../theme/colors';
import { display, mono } from '../theme/typography';
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
    <View style={[styles.wrapper, { top: insets.top + spacing.xs }]} pointerEvents="box-none">
      <Pressable style={styles.bar} onPress={expand}>
        <ActivityIndicator color={colors.accent} size="small" />
        <View style={styles.textGroup}>
          <Text style={styles.title}>Waiting for players…</Text>
          <Text style={styles.subtitle}>
            CODE {waitingRoom.code ?? formatRoomCode(waitingRoom.id)}
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
    left: spacing.md,
    right: spacing.md,
    zIndex: 10,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  textGroup: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontFamily: display.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  subtitle: {
    fontFamily: mono.medium,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textMuted,
  },
});
