import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import GamesNavigator from './GamesNavigator';
import WalletScreen from '../screens/WalletScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ProfileScreen from '../screens/ProfileScreen';
import DemoGamesScreen from '../screens/DemoGamesScreen';
import KKTabBar from './KKTabBar';

const Tab = createBottomTabNavigator();

/**
 * Bottom tabs: PROFILE · WALLET · [LOBBY] · HISTORY · DEMO, where the centre
 * LOBBY is a raised circular action that opens the game lobby (the Games
 * stack). Chrome is drawn by KKTabBar.
 *
 * Screens are registered in visual (left-to-right) order so the tab bar's
 * centre slot lands on the lobby.
 */
export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Games"
      tabBar={props => <KKTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />
      <Tab.Screen name="Games" component={GamesNavigator} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="DemoGames" component={DemoGamesScreen} />
    </Tab.Navigator>
  );
}
