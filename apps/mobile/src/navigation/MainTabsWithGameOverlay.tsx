import { useEffect } from 'react';
import { View } from 'react-native';

import { apiClient } from '../api/client';
import WaitingForPlayersMinimizedBar from '../games/WaitingForPlayersMinimizedBar';
import WaitingForPlayersPopup from '../games/WaitingForPlayersPopup';
import { useGameStore } from '../store/game.store';
import MainTabNavigator from './MainTabNavigator';

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
  const setWaitingRoom = useGameStore(state => state.setWaitingRoom);

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

  return (
    <View style={{ flex: 1 }}>
      <MainTabNavigator />
      <WaitingForPlayersMinimizedBar />
      <WaitingForPlayersPopup />
    </View>
  );
}
