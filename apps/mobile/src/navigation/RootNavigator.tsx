import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ErrorCode } from '@gaming-platform/core';

import BattleshipGame from '../games/battleship/BattleshipGame';
import ErrorScreen from '../screens/ErrorScreen';
import LoginScreen from '../screens/LoginScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import { useCurrentUserStore } from '../store/currentUser.store';
import { useWebsocketStore } from '../store/websocket.store';
import { colors } from '../theme/colors';
import MainTabsWithGameOverlay from './MainTabsWithGameOverlay';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Grace period before a load failure turns into a full error screen — avoids
 *  flashing an alarming UI for a request that's simply a little slow. */
const ERROR_SCREEN_DELAY_MS = 6000;

/**
 * Auth-gated navigation:
 * - Auth still loading (reading the persisted JWT) -> spinner.
 * - Logged out -> Login only.
 * - Logged in -> load profile + ensure a wallet exist together (spinner
 *   while either is in flight); if either fails, keep spinning for a short
 *   grace period, then show a full error screen with a retry button.
 * - Once both are ready, route to Onboarding (username not set yet) or the
 *   main tabs.
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

  const hasError = profileStatus === 'error' || walletStatus === 'error';
  const [showErrorScreen, setShowErrorScreen] = useState(false);

  const connectSocket = useWebsocketStore(state => state.connect);
  const disconnectSocket = useWebsocketStore(state => state.disconnect);

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

  // One socket connection per logged-in session, reused everywhere (games
  // etc.) — connect once authenticated, tear down on logout.
  useEffect(() => {
    if (authStatus === 'authenticated') {
      connectSocket();
    } else {
      disconnectSocket();
    }
  }, [authStatus, connectSocket, disconnectSocket]);

  useEffect(() => {
    if (!hasError) {
      setShowErrorScreen(false);
      return;
    }
    const timer = setTimeout(
      () => setShowErrorScreen(true),
      ERROR_SCREEN_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [hasError]);

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
    if (hasError && showErrorScreen) {
      const error = (profileStatus === 'error' ? profileError : walletError) ?? {
        message: 'Something went wrong.',
        code: ErrorCode.Unknown,
      };
      return (
        <ErrorScreen
          message={error.message}
          code={error.code}
          onRetry={() => {
            setShowErrorScreen(false);
            if (profileStatus === 'error') {
              loadProfile();
            }
            if (walletStatus === 'error') {
              ensureWallet();
            }
          }}
        />
      );
    }
    return <Spinner />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {username === null ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      ) : (
        <>
          <Stack.Screen name="MainTabs" component={MainTabsWithGameOverlay} />
          {/* Multiplayer (carries a roomId) and the demo both use BattleshipGame,
              which picks its engine from the presence of a roomId route param.
              The iOS edge-swipe is disabled so leaving always goes through the
              in-game guard (leaving an active match forfeits it). */}
          <Stack.Screen
            name="Battleship"
            component={BattleshipGame}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen
            name="BattleshipSetup"
            component={BattleshipGame}
            options={{ gestureEnabled: false }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

function Spinner() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.brandStart} />
    </View>
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
