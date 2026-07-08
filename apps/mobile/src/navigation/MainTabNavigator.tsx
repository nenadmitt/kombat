import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { CurvedBottomBar } from 'react-native-curved-bottom-bar';

import GamesNavigator from './GamesNavigator';
import WalletScreen from '../screens/WalletScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ProfileScreen from '../screens/ProfileScreen';
import DemoGamesScreen from '../screens/DemoGamesScreen';
import Icon, { type IconName } from '../components/Icon';
import { colors } from '../theme/colors';

const TAB_ICONS: Record<string, IconName> = {
  Games: 'games',
  Wallet: 'wallet',
  History: 'history',
  Profile: 'user',
  DemoGames: 'grid',
};

/** Args passed to the library's `renderCircle` / `tabBar` render props. */
type BarSlot = {
  routeName: string;
  selectedTab: string;
  navigate: (routeName: string) => void;
};

// The library ships types built against an older @react-navigation, so its
// Navigator prop type is out of sync with v7. Relax it to unblock — the Screen
// children below stay fully typed.
const Navigator = CurvedBottomBar.Navigator as unknown as React.ComponentType<
  Record<string, unknown>
>;

/**
 * Curved bottom bar (react-native-curved-bottom-bar): a floating gradient
 * "Play" circle sits in an upward notch at the center, with two tabs on each
 * side. The circle is a shortcut into the Games tab.
 */
export default function MainTabNavigator() {
  return (
    <Navigator
      type="UP"
      circlePosition="CENTER"
      bgColor={colors.surface}
      borderColor={colors.cardBorder}
      borderWidth={1}
      height={64}
      circleWidth={56}
      borderTopLeftRight
      initialRouteName="Profile"
      shadowStyle={styles.shadow}
      screenOptions={{ headerShown: false }}
      renderCircle={({ navigate }: BarSlot) => (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Play"
          activeOpacity={0.9}
          style={styles.circle}
          onPress={() => navigate('Games')}
        >
          <View style={styles.circleFill}>
            <Icon type="swords" color={colors.onAccent} size={26} />
          </View>
        </TouchableOpacity>
      )}
      tabBar={({ routeName, selectedTab, navigate }: BarSlot) => {
        const focused = routeName === selectedTab;
        return (
          <TouchableOpacity
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={routeName}
            onPress={() => navigate(routeName)}
            style={styles.tab}
          >
            <Icon
              type={TAB_ICONS[routeName] ?? 'games'}
              color={focused ? colors.accent : colors.textMuted}
              size={24}
            />
          </TouchableOpacity>
        );
      }}
    >
      <CurvedBottomBar.Screen
        name="Games"
        position="LEFT"
        component={GamesNavigator}
      />
      <CurvedBottomBar.Screen
        name="Wallet"
        position="LEFT"
        component={WalletScreen}
      />
      <CurvedBottomBar.Screen
        name="History"
        position="RIGHT"
        component={HistoryScreen}
      />
      <CurvedBottomBar.Screen
        name="Profile"
        position="RIGHT"
        component={ProfileScreen}
      />
      <CurvedBottomBar.Screen
        name="DemoGames"
        position="RIGHT"
        component={DemoGamesScreen}
      />
    </Navigator>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    // Ring the FAB with the screen background so it reads as a raised notch.
    borderWidth: 4,
    borderColor: colors.background,
  },
  circleFill: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
