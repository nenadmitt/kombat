import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  GameRoomStatus,
  STAKE_EVENTS,
  type GameRoomSummary,
} from '@gaming-platform/core';

import { apiClient } from '../api/client';
import { useConfirm } from '../components/ui';
import { GAME_TYPE_SCREENS } from '../games/game-type-screens';
import ResumeMatchModal from '../games/ResumeMatchModal';
import WaitingForPlayersMinimizedBar from '../games/WaitingForPlayersMinimizedBar';
import WaitingForPlayersPopup from '../games/WaitingForPlayersPopup';
import { useGameStore } from '../store/game.store';
import { useWebsocketStore } from '../store/websocket.store';
import MainTabNavigator from './MainTabNavigator';
import type { RootStackParamList } from './types';

/**
 * Wraps the tab navigator so the "Waiting for Players" popup/minimized-bar
 * render above every tab (Games/Wallet/History/Profile) instead of being
 * tied to a single screen - this is what lets it survive tab switches.
 *
 * Also checks once on mount (i.e. once per login session, since this only
 * mounts once the user reaches the main tabs) whether the user already has
 * an open room from before - e.g. they created one, then killed/reopened
 * the app - and if so, resumes the popup immediately instead of leaving it
 * silently orphaned.
 */
export default function MainTabsWithGameOverlay() {
  // This component *is* the "MainTabs" root-stack screen, so it already has
  // direct root-navigation access - no cross-navigator hop needed to reach
  // the root-level Battleship screen.
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const setWaitingRoom = useGameStore(state => state.setWaitingRoom);
  const setResumableMatch = useGameStore(state => state.setResumableMatch);
  const clearResumableMatch = useGameStore(state => state.clearResumableMatch);
  const clearWaitingRoom = useGameStore(state => state.clear);
  const setSecuringStakes = useGameStore(state => state.setSecuringStakes);
  const onSocketEvent = useWebsocketStore(state => state.on);
  const confirm = useConfirm();

  // Stake lifecycle for the room CREATOR: their app sits in the waiting
  // popup while the joiner triggers escrow. funding swaps the popup for the
  // playful "setting up your match" overlay; funded clears it (the deferred
  // game:opponent-joined below does the navigation); failed means voided.
  useEffect(() => {
    const offFunding = onSocketEvent(STAKE_EVENTS.funding, () =>
      setSecuringStakes(true),
    );
    const offFunded = onSocketEvent(STAKE_EVENTS.funded, () =>
      setSecuringStakes(false),
    );
    const offFailed = onSocketEvent(STAKE_EVENTS.failed, payload => {
      setSecuringStakes(false);
      // Only the creator holds a waitingRoom - the joiner's lobby screen
      // shows its own alert for this event.
      if (useGameStore.getState().waitingRoom) {
        clearWaitingRoom();
        const reason =
          payload && typeof payload === 'object' && 'reason' in payload
            ? String((payload as { reason: unknown }).reason)
            : 'The match was voided.';
        // Let the waiting popup finish dismissing before presenting the
        // notice sheet - overlapping Modal transitions wedge iOS touches.
        setTimeout(() => {
          void confirm({
            title: 'Stakes could not be secured',
            message: reason,
            icon: 'warning',
            mode: 'info',
          });
        }, 500);
      }
    });
    return () => {
      offFunding();
      offFunded();
      offFailed();
    };
  }, [onSocketEvent, setSecuringStakes, clearWaitingRoom, confirm]);

  useEffect(() => {
    apiClient
      .getMyActiveGameRoom()
      .then(room => {
        if (!room) {
          return;
        }
        // A Pending room means we're still waiting for an opponent (resume the
        // waiting popup); an InProgress one is a live match to rejoin/forfeit.
        if (room.status === GameRoomStatus.InProgress) {
          setResumableMatch(room);
        } else {
          setWaitingRoom(room);
        }
      })
      .catch(() => {
        // Non-critical - just means we won't resume anything this session.
      });
  }, [setWaitingRoom, setResumableMatch]);

  const handleRejoin = useCallback(
    (room: GameRoomSummary) => {
      clearResumableMatch();
      (navigation.navigate as (screen: string, params: unknown) => void)(
        GAME_TYPE_SCREENS[room.gameType],
        {
          roomId: room.id,
          stakeToken: room.stakeToken,
          stakeAmount: room.stakeAmount,
        },
      );
    },
    [clearResumableMatch, navigation],
  );

  // Someone joined the room this user is waiting in - stop waiting and
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
      // Read live, not via a reactive selector - this only needs the value
      // at the moment the event fires, not to resubscribe when it changes.
      const waitingRoom = useGameStore.getState().waitingRoom;
      clearWaitingRoom();
      if (!waitingRoom) {
        return;
      }
      // Same dynamic-route-name cast as GameLobyScreen's join handler.
      (navigation.navigate as (screen: string, params: unknown) => void)(
        GAME_TYPE_SCREENS[waitingRoom.gameType],
        {
          roomId,
          stakeToken: waitingRoom.stakeToken,
          stakeAmount: waitingRoom.stakeAmount,
        },
      );
    });
  }, [onSocketEvent, clearWaitingRoom, navigation]);

  return (
    <View style={{ flex: 1 }}>
      <MainTabNavigator />
      <WaitingForPlayersMinimizedBar />
      <WaitingForPlayersPopup />
      <ResumeMatchModal onRejoin={handleRejoin} />
    </View>
  );
}
