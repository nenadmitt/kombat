import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../navigation/types';

/**
 * Leaving a match. A plain goBack() is dropped with "GO_BACK was not handled
 * by any navigator" whenever nothing sits under this route - a cold start or a
 * deep link straight into a match - so fall back to the tabs.
 */
export function useMatchExit(): () => void {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  }, [navigation]);
}
