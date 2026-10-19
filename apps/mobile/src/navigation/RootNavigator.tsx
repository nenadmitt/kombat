import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ErrorCode } from '@gaming-platform/core';

import BattleshipGame from '../games/battleship/BattleshipGame';
import LudoGame from '../games/ludo/LudoGame';
import RpsGame from '../games/rps/RpsGame';
import ChromaGame from '../games/chroma/ChromaGame';
import SalvoGame from '../games/salvo/SalvoGame';
import ErrorScreen from '../screens/ErrorScreen';
import LoginScreen from '../screens/LoginScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import { useCurrentUserStore } from '../store/currentUser.store';
import { useServerStore } from '../store/server.store';
import { useWebsocketStore } from '../store/websocket.store';
import { colors } from '../theme/colors';
import MainTabsWithGameOverlay from './MainTabsWithGameOverlay';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const ERROR_SCREEN_DELAY_MS = 6000;

export default function RootNavigator() {
  const authStatus = useCurrentUserStore(state => state.authStatus);
  const loadAuth = useCurrentUserStore(state => state.load);

  const profileStatus = useCurrentUserStore(state => state.profileStatus);
  const profileError = useCurrentUserStore(state => state.profileError);
  const loadProfile = useCurrentUserStore(state => state.loadProfile);
  const logout = useCurrentUserStore(state => state.logout);
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
    void useServerStore.getState().refresh();
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
          onSignOut={() => {
            setShowErrorScreen(false);
            void logout();
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
          {/* iOS edge-swipe is off so leaving always goes through the in-game forfeit guard. */}
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
          <Stack.Screen
            name="Ludo"
            component={LudoGame}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen
            name="LudoSetup"
            component={LudoGame}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen
            name="TripleCut"
            component={RpsGame}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen
            name="TripleCutSetup"
            component={RpsGame}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen
            name="ChromaClash"
            component={ChromaGame}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen
            name="ChromaClashSetup"
            component={ChromaGame}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen
            name="Salvo"
            component={SalvoGame}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen
            name="SalvoSetup"
            component={SalvoGame}
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
