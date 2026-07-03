import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import Icon, { type IconName } from '../components/Icon';
import { colors } from '../theme/colors';

/**
 * Notch-style tab bar: dark, anchored to the bottom edge. The selected tab's
 * icon sits in a blue rounded tile that pops up above the bar's top edge,
 * ringed by the screen background so it reads as a raised tab.
 */
const TAB_ICONS: Record<string, IconName> = {
  Games: 'games',
  Wallet: 'wallet',
  History: 'history',
  Profile: 'user',
};

export default function NotchTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    // Outer wrapper paints the screen background behind the bar's rounded
    // corners — otherwise the navigator's default (light) background bleeds
    // through the corner cutouts.
    <View style={styles.wrapper}>
      <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
        {state.routes.map((route, index) => {
        const { options } = descriptors[route.key]!;
        const focused = state.index === index;
        const icon = TAB_ICONS[route.name] ?? 'games';

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

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? route.name}
            onPress={onPress}
            style={styles.tab}
          >
            <View style={[styles.tile, focused && styles.tileActive]}>
              <Icon
                type={icon}
                color={focused ? colors.textPrimary : colors.textMuted}
                size={24}
              />
            </View>
          </Pressable>
        );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.background,
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 64,
  },
  tile: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileActive: {
    backgroundColor: colors.brandEnd,
    // Pop the selected tab up out of the bar, ringed by the screen background
    // so it reads as a raised notch (per the reference design).
    transform: [{ translateY: -24 }],
    borderWidth: 4,
    borderColor: colors.background,
  },
});
