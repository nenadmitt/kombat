import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import LoginScreen from '../screens/LoginScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import { useCurrentUserStore } from '../store/currentUser.store';
import { colors } from '../theme/colors';
import MainTabNavigator from './MainTabNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Auth-gated navigation:
 * - Auth still loading (reading the persisted JWT) -> spinner.
 * - Logged out -> Login only.
 * - Logged in -> load profile + ensure a wallet exist together (spinner
 *   while either is in flight); once both are ready, route to Onboarding
 *   (username not set yet) or the main tabs.
 */
export default function RootNavigator() {
  const authStatus = useCurrentUserStore(state => state.authStatus);
  const loadAuth = useCurrentUserStore(state => state.load);

  const profileStatus = useCurrentUserStore(state => state.profileStatus);
  const profileError = useCurrentUserStore(state => state.profileError);
  const loadProfile = useCurrentUserStore(state => state.loadProfile);
  const username = useCurrentUserStore(state => state.username);

  const walletStatus = useCurrentUserStore(state => state.walletStatus);
  const walletError = useCurrentUserStore(state => state.walletError);
  const ensureWallet = useCurrentUserStore(state => state.ensureWallet);

  useEffect(() => {
    loadAuth();
  }, [loadAuth]);

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      return;
    }
    if (profileStatus === 'idle') {
      loadProfile();
    }
    if (walletStatus === 'idle') {
      ensureWallet();
    }
  }, [authStatus, profileStatus, walletStatus, loadProfile, ensureWallet]);

  if (authStatus === 'loading') {
    return <Spinner />;
  }

  if (authStatus === 'unauthenticated') {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  if (profileStatus !== 'ready' || walletStatus !== 'ready') {
    const errorMessage =
      profileStatus === 'error'
        ? profileError
        : walletStatus === 'error'
          ? walletError
          : undefined;
    return <Spinner message={errorMessage} />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {username === null ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      ) : (
        <Stack.Screen name="MainTabs" component={MainTabNavigator} />
      )}
    </Stack.Navigator>
  );
}

function Spinner({ message }: { message?: string | null }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.brandStart} />
      {message ? <Text style={styles.errorText}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: 12,
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
