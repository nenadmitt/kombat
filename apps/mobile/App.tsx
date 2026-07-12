/**
 * Gaming Platform — app root.
 * Wraps the navigation container; screens live in src/.
 *
 * @format
 */

import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConfirmProvider } from './src/components/ui';
import RootNavigator from './src/navigation/RootNavigator';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <NavigationContainer>
        <ConfirmProvider>
          <RootNavigator />
        </ConfirmProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App;
