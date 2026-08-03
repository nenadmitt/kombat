/**
 * Gaming Platform — app root.
 * Wraps the navigation container; screens live in src/.
 *
 * @format
 */

import React, { useState } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import UpdateRequiredGate from './src/components/UpdateRequiredGate';
import { ConfirmProvider } from './src/components/ui';
import RootNavigator from './src/navigation/RootNavigator';
import type { RootStackParamList } from './src/navigation/types';

const navigationRef = createNavigationContainerRef<RootStackParamList>();

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [currentRoute, setCurrentRoute] = useState<string | undefined>();

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <NavigationContainer
        ref={navigationRef}
        onReady={() => setCurrentRoute(navigationRef.getCurrentRoute()?.name)}
        onStateChange={() =>
          setCurrentRoute(navigationRef.getCurrentRoute()?.name)
        }
      >
        <ConfirmProvider>
          <RootNavigator />
          <UpdateRequiredGate currentRoute={currentRoute} />
        </ConfirmProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App;
