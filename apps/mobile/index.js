/**
 * @format
 */

// Polyfills required by @privy-io/expo — MUST come before any other import.
import 'fast-text-encoding';
import 'react-native-get-random-values';
import '@ethersproject/shims';

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
