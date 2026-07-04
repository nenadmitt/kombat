import { createNativeStackNavigator } from '@react-navigation/native-stack';

import GameLobyScreen from '../screens/GameLobyScreen';
import BattleshipGameScreen from '../games/battleship/GameScreen';
import type { GamesStackParamList } from './types';

const Stack = createNativeStackNavigator<GamesStackParamList>();

/** Nested stack behind the Games tab — the only tab with more than one screen. */
export default function GamesNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GamesList" component={GameLobyScreen} />
      <Stack.Screen name="Battleship" component={BattleshipGameScreen} />
    </Stack.Navigator>
  );
}
