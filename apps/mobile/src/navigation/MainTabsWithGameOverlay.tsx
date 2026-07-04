import { useEffect } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { apiClient } from '../api/client';
import { GAME_TYPE_SCREENS } from '../games/game-type-screens';
import WaitingForPlayersMinimizedBar from '../games/WaitingForPlayersMinimizedBar';
import WaitingForPlayersPopup from '../games/WaitingForPlayersPopup';
import { useGameStore } from '../store/game.store';
import { useWebsocketStore } from '../store/websocket.store';
import MainTabNavigator from './MainTabNavigator';
import type { RootStackParamList } from './types';

/**
 * Wraps the tab navigator so the "Waiting for Players" popup/minimized-bar
 * render above every tab (Games/Wallet/History/Profile) instead of being
 * tied to a single screen — this is what lets it survive tab switches.
 *
 * Also checks once on mount (i.e. once per login session, since this only
 * mounts once the user reaches the main tabs) whether the user already has
 * an open room from before — e.g. they created one, then killed/reopened
 * the app — and if so, resumes the popup immediately instead of leaving it
 * silently orphaned.
 */
export default function MainTabsWithGameOverlay() {
  // This component *is* the "MainTabs" root-stack screen, so it already has
  // direct root-navigation access — no cross-navigator hop needed to reach
  // the root-level Battleship screen.
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const setWaitingRoom = useGameStore(state => state.setWaitingRoom);
  const clearWaitingRoom = useGameStore(state => state.clear);
  const onSocketEvent = useWebsocketStore(state => state.on);

  useEffect(() => {
    apiClient
      .getMyActiveGameRoom()
      .then(room => {
        if (room) {
          setWaitingRoom(room);
        }
      })
      .catch(() => {
        // Non-critical — just means we won't resume the popup this session.
      });
  }, [setWaitingRoom]);

  // Someone joined the room this user is waiting in — stop waiting and
  // transfer them into whichever screen their game type uses.
  useEffect(() => {
    return onSocketEvent('game:opponent-joined', payload => {
      const roomId =
        payload && typeof payload === 'object' && 'roomId' in payload
          ? (payload as { roomId: unknown }).roomId
          : undefined;
      if (typeof roomId !== 'string') {
        return;
      }
      // Read live, not via a reactive selector — this only needs the value
      // at the moment the event fires, not to resubscribe when it changes.
      const gameType = useGameStore.getState().waitingRoom?.gameType;
      clearWaitingRoom();
      if (gameType === undefined) {
        return;
      }
      // Same dynamic-route-name cast as GameLobyScreen's join handler.
      (navigation.navigate as (screen: string, params: unknown) => void)(
        GAME_TYPE_SCREENS[gameType],
        { roomId },
      );
    });
  }, [onSocketEvent, clearWaitingRoom, navigation]);

  return (
    <View style={{ flex: 1 }}>
      <MainTabNavigator />
      <WaitingForPlayersMinimizedBar />
      <WaitingForPlayersPopup />
    </View>
  );
}
