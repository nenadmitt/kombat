/**
 * Gaming Platform — app root.
 * Wraps the navigation container; screens live in src/.
 *
 * @format
 */

import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RootNavigator from './src/navigation/RootNavigator';
import { useCurrentUserStore } from './src/store/currentUser.store';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const status = useCurrentUserStore(state => state.status);

  // Load the current user once when the app starts.
  useEffect(() => {
    useCurrentUserStore.getState().load();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      {status === 'loading' ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default App;
