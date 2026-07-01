import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { usePrivy } from '@privy-io/expo';

import HomeScreen from '../screens/HomeScreen';
import DetailsScreen from '../screens/DetailsScreen';
import BattleshipGameScreen from '../games/battleship/GameScreen';
import LoginScreen from '../screens/LoginScreen';
import WalletScreen from '../screens/WalletScreen';
import { useCurrentUserStore } from '../store/currentUser.store';
import { colors } from '../theme/colors';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Auth-gated navigation:
 * - Privy still initializing → spinner.
 * - Logged out → Login (email OTP).
 * - Logged in → Wallet first, with the rest of the app behind it.
 */
export default function RootNavigator() {
  const { user, isReady } = usePrivy();

  // Mirror the Privy user into the app store (name = email for now).
  useEffect(() => {
    const email = user?.linked_accounts.find(
      account => account.type === 'email',
    );
    useCurrentUserStore
      .getState()
      .setName(email && 'address' in email ? email.address : '');
  }, [user]);

  if (!isReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brandStart} />
      </View>
    );
  }

  if (!user) {
    return (
      <Stack.Navigator>
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator initialRouteName="Wallet">
      <Stack.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Home' }}
      />
      <Stack.Screen
        name="Details"
        component={DetailsScreen}
        options={{ title: 'Screen 2' }}
      />
      <Stack.Screen
        name="Battleship"
        component={BattleshipGameScreen}
        options={{ title: 'Battleship' }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
