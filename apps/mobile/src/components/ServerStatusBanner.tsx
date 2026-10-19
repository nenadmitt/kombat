import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { env } from '../config/env';
import { useServerStore } from '../store/server.store';
import { colors, radius, spacing } from '../theme/colors';
import { body, type } from '../theme/typography';
import Icon, { type IconName } from './Icon';

const ICON_TILE = 40;

type Tone = {
  icon: IconName;
  fill: string;
  border: string;
  tileFill: string;
  accent: string;
  title: string;
  actionLabel: string;
};

// Opaque on purpose: this paints outside a Screen, so a translucent fill would composite against the light root window.
export default function ServerStatusBanner() {
  const status = useServerStore(state => state.status);
  const message = useServerStore(state => state.message);
  const refresh = useServerStore(state => state.refresh);
  const insets = useSafeAreaInsets();

  if (status === 'online') {
    return null;
  }

  const offline = status === 'offline';
  const tone = offline ? OFFLINE : MAINTENANCE;
  const detailsUrl = env.maintenanceDetailsUrl;
  const copy = offline
    ? 'Reconnecting to the game server. Online games are paused.'
    : (message ??
      'Matches are paused while we work. Your wallet and pot are untouched.');

  const action = offline
    ? () => void refresh()
    : detailsUrl
      ? () => void Linking.openURL(detailsUrl)
      : null;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.xs }]}>
      <View
        style={[
          styles.card,
          { backgroundColor: tone.fill, borderColor: tone.border },
        ]}
      >
        <View style={[styles.tile, { backgroundColor: tone.tileFill }]}>
          <Icon type={tone.icon} color={tone.accent} size={18} />
        </View>

        <View style={styles.mid}>
          <View style={styles.titleRow}>
            <View style={[styles.dot, { backgroundColor: tone.accent }]} />
            <Text numberOfLines={1} style={styles.title}>
              {tone.title}
            </Text>
          </View>
          <Text style={styles.copy}>{copy}</Text>
        </View>

        {action ? (
          <Pressable
            onPress={action}
            accessibilityRole="button"
            accessibilityLabel={tone.actionLabel}
            hitSlop={6}
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: tone.tileFill },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.actionText, { color: tone.accent }]}>
              {tone.actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const MAINTENANCE: Tone = {
  icon: 'wrench',
  fill: colors.surface,
  border: colors.goldBorder,
  tileFill: colors.goldSoft,
  accent: colors.gold,
  title: 'Maintenance in progress',
  actionLabel: 'Details',
};

const OFFLINE: Tone = {
  icon: 'wifi-off',
  fill: colors.surface,
  border: colors.dangerBorder,
  tileFill: colors.dangerSoft,
  accent: colors.dangerLight,
  title: "You're offline",
  actionLabel: 'Retry',
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.canvas,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  tile: {
    width: ICON_TILE,
    height: ICON_TILE,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: {
    flex: 1,
    gap: spacing.xxs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  title: {
    ...type.subheading,
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
  },
  copy: {
    fontFamily: body.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  action: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
  actionText: {
    fontFamily: body.bold,
    fontSize: 13,
  },
});
