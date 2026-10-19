import { createNativeStackNavigator } from '@react-navigation/native-stack';

import GameLobyScreen from '../screens/GameLobyScreen';
import type { GamesStackParamList } from './types';

const Stack = createNativeStackNavigator<GamesStackParamList>();

export default function GamesNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GamesList" component={GameLobyScreen} />
    </Stack.Navigator>
  );
}
