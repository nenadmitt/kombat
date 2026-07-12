import { createNativeStackNavigator } from '@react-navigation/native-stack';

import GameLobyScreen from '../screens/GameLobyScreen';
import type { GamesStackParamList } from './types';

const Stack = createNativeStackNavigator<GamesStackParamList>();

/** Nested stack behind the Games tab - ready for a real gameplay screen to land here. */
export default function GamesNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GamesList" component={GameLobyScreen} />
    </Stack.Navigator>
  );
}
