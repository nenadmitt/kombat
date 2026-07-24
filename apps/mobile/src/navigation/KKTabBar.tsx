import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import Icon, { type IconName } from '../components/Icon';
import { colors } from '../theme/colors';
import { mono } from '../theme/typography';

const INACTIVE = colors.textMuted;

type TabConfig = { label: string; icon: IconName; center?: boolean };

/** Keyed by route name; `center` marks the raised LOBBY action. */
const CONFIG: Record<string, TabConfig> = {
  Profile: { label: 'PROFILE', icon: 'user' },
  Wallet: { label: 'WALLET', icon: 'wallet' },
  Games: { label: 'LOBBY', icon: 'gem', center: true },
  History: { label: 'HISTORY', icon: 'history' },
  DemoGames: { label: 'DEMO', icon: 'games' },
};

/**
 * Bottom navigation matching the KKNavBold design: a flat, near-opaque glass
 * bar with a top active-indicator on each side tab and a raised circular
 * LOBBY action in the centre. IBM Plex Mono uppercase labels; the active tab
 * is tinted with the accent.
 */
export default function KKTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {state.routes.map((route, index) => {
        const cfg = CONFIG[route.name];
        if (!cfg) return null;
        const focused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const tint = focused ? colors.accent : INACTIVE;

        if (cfg.center) {
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={cfg.label}
              style={styles.centerSlot}
            >
              <View style={styles.fab}>
                <Svg width={30} height={30} viewBox="0 0 24 24">
                  <Path d="M4.5 9 L12 3 L19.5 9 L12 21 Z" fill={colors.onAccent} />
                </Svg>
              </View>
              <Text style={[styles.label, { color: tint }]}>{cfg.label}</Text>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={cfg.label}
            style={styles.slot}
          >
            {focused ? <View style={styles.indicator} /> : null}
            <Icon type={cfg.icon} color={tint} size={23} />
            <Text style={[styles.label, { color: tint }]}>{cfg.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    // Near-opaque glass over the Nocturne ground (RN has no backdrop-blur
    // without a native module).
    backgroundColor: 'rgba(22,24,38,0.97)',
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingTop: 12,
    paddingHorizontal: 4,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
    paddingTop: 7,
  },
  indicator: {
    position: 'absolute',
    top: -1,
    width: 26,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
  },
  fab: {
    marginTop: -42,
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: colors.accent,
    borderWidth: 4,
    borderColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    // Accent bloom under the raised LOBBY action (0 10px 26px accent).
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  label: {
    fontFamily: mono.bold,
    fontSize: 9,
    letterSpacing: 0.7,
    marginTop: 7,
  },
});
