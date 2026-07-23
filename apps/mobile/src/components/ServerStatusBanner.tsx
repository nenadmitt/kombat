import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useServerStore } from '../store/server.store';
import { colors, spacing } from '../theme/colors';
import { body } from '../theme/typography';
import Icon from './Icon';

/**
 * Slim persistent bar above the tabs while the server is unreachable or in
 * maintenance. Renders nothing when everything is fine. Sits above the tab
 * navigator in normal layout flow, so screens are pushed down rather than
 * covered (their SafeAreaViews adapt - insets are position-aware).
 */
export default function ServerStatusBanner() {
  const status = useServerStore(state => state.status);
  const message = useServerStore(state => state.message);
  const refresh = useServerStore(state => state.refresh);
  const insets = useSafeAreaInsets();

  if (status === 'online') {
    return null;
  }

  const offline = status === 'offline';
  const copy = offline
    ? "Can't reach the game server - online games are unavailable"
    : (message ?? 'Maintenance in progress - multiplayer is temporarily unavailable');

  return (
    <Pressable
      style={[styles.banner, { paddingTop: insets.top + spacing.xs }]}
      onPress={offline ? () => void refresh() : undefined}
    >
      <Icon
        type={offline ? 'wifi-off' : 'warning'}
        color={colors.danger}
        size={16}
      />
      <View style={styles.textWrap}>
        <Text style={styles.text}>{copy}</Text>
        {offline && <Text style={styles.retry}>Tap to retry</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.cardBorder,
  },
  textWrap: { flex: 1 },
  text: {
    fontFamily: body.medium,
    fontSize: 12,
    color: colors.textPrimary,
  },
  retry: {
    fontFamily: body.medium,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
