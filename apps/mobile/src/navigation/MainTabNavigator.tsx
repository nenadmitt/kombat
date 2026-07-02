import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import GamesNavigator from './GamesNavigator';
import WalletScreen from '../screens/WalletScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { colors } from '../theme/colors';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<keyof MainTabParamList, string> = {
  Games: '🎮',
  Wallet: '💳',
  History: '🕓',
  Profile: '👤',
};

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brandStart,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.cardBorder,
        },
        tabBarIcon: ({ size }) => (
          <Text style={{ fontSize: size }}>{TAB_ICONS[route.name]}</Text>
        ),
      })}
    >
      <Tab.Screen name="Games" component={GamesNavigator} />
      <Tab.Screen name="Wallet" component={WalletScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
