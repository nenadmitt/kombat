import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  GameRoomStatus,
  PLATFORM_EVENTS,
  ROOM_EVENTS,
  STAKE_EVENTS,
  STAKE_POT_EVENTS,
  type GameRoomSummary,
  type PlatformStatus,
  type RoomPlayerJoinedPayload,
  type StakePotBalances,
} from '@gaming-platform/core';

import { apiClient } from '../api/client';
import ServerStatusBanner from '../components/ServerStatusBanner';
import WelcomeBonusModal from '../components/WelcomeBonusModal';
import { MODAL_DISMISS_MS, useConfirm } from '../components/ui';
import { GAME_TYPE_SCREENS } from '../games/game-type-screens';
import ResumeMatchModal from '../games/ResumeMatchModal';
import WaitingForPlayersMinimizedBar from '../games/WaitingForPlayersMinimizedBar';
import WaitingForPlayersPopup from '../games/WaitingForPlayersPopup';
import { useCurrentUserStore } from '../store/currentUser.store';
import { useGameStore } from '../store/game.store';
import { useServerStore } from '../store/server.store';
import { useStakePotStore } from '../store/stakePot.store';
import { useWebsocketStore } from '../store/websocket.store';
import MainTabNavigator from './MainTabNavigator';
import type { RootStackParamList } from './types';

export default function MainTabsWithGameOverlay() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const setWaitingRoom = useGameStore(state => state.setWaitingRoom);
  const setResumableMatch = useGameStore(state => state.setResumableMatch);
  const clearWaitingRoom = useGameStore(state => state.clear);
  const onSocketEvent = useWebsocketStore(state => state.on);
  const confirm = useConfirm();
  const serverStatus = useServerStore(state => state.status);
  const waitingRoom = useGameStore(state => state.waitingRoom);
  const resumableMatch = useGameStore(state => state.resumableMatch);
  const userId = useCurrentUserStore(state => state.userId);

  // Local persistence only: the server refuses a second claim regardless.
  const [welcomeOffer, setWelcomeOffer] = useState(false);
  useEffect(() => {
    if (!userId) {
      return;
    }
    let cancelled = false;
    void AsyncStorage.getItem(`welcome-bonus:${userId}`).then(state => {
      if (!cancelled && state === null) {
        setWelcomeOffer(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const settleWelcomeOffer = useCallback(
    (outcome: 'claimed' | 'dismissed') => {
      if (userId) {
        void AsyncStorage.setItem(`welcome-bonus:${userId}`, outcome);
      }
    },
    [userId],
  );

  useEffect(() => {
    return onSocketEvent(PLATFORM_EVENTS.maintenance, payload => {
      if (payload && typeof payload === 'object' && 'maintenance' in payload) {
        useServerStore
          .getState()
          .applyPlatformStatus(payload as PlatformStatus);
      }
    });
  }, [onSocketEvent]);

  useEffect(() => {
    return onSocketEvent(STAKE_POT_EVENTS.balance, payload => {
      if (payload && typeof payload === 'object' && 'available' in payload) {
        useStakePotStore.getState().apply(payload as StakePotBalances);
      }
    });
  }, [onSocketEvent]);

  // The joiner learns from their own failed request; the creator only finds out here.
  useEffect(() => {
    const offFailed = onSocketEvent(STAKE_EVENTS.failed, payload => {
      if (useGameStore.getState().waitingRoom) {
        clearWaitingRoom();
        const reason =
          payload && typeof payload === 'object' && 'reason' in payload
            ? String((payload as { reason: unknown }).reason)
            : 'The match was voided.';
        // Let the waiting popup finish dismissing first: overlapping Modal transitions wedge iOS touches.
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
    return offFailed;
  }, [onSocketEvent, clearWaitingRoom, confirm]);

  useEffect(() => {
    apiClient
      .getMyActiveGameRoom()
      .then(room => {
        if (!room) {
          return;
        }
        if (room.status === GameRoomStatus.InProgress) {
          setResumableMatch(room);
        } else {
          const myUserId = useCurrentUserStore.getState().userId;
          setWaitingRoom(room, myUserId !== null && room.creatorUserId !== myUserId);
        }
      })
      .catch(() => {
      });
  }, [setWaitingRoom, setResumableMatch]);

  useEffect(() => {
    const matchesWaiting = (payload: unknown): payload is { roomId: string } =>
      payload !== null &&
      typeof payload === 'object' &&
      'roomId' in payload &&
      (payload as { roomId: unknown }).roomId ===
        useGameStore.getState().waitingRoom?.id;

    const onRoster = (payload: unknown) => {
      if (matchesWaiting(payload)) {
        useGameStore
          .getState()
          .setWaitingJoinedCount(
            (payload as RoomPlayerJoinedPayload).joinedCount,
          );
      }
    };
    const offJoined = onSocketEvent(ROOM_EVENTS.playerJoined, onRoster);
    const offLeft = onSocketEvent(ROOM_EVENTS.playerLeft, onRoster);
    const offStarted = onSocketEvent(ROOM_EVENTS.started, payload => {
      if (!matchesWaiting(payload)) {
        return;
      }
      const waitingRoom = useGameStore.getState().waitingRoom!;
      clearWaitingRoom();
      setTimeout(() => {
        (navigation.navigate as (screen: string, params: unknown) => void)(
          GAME_TYPE_SCREENS[waitingRoom.gameType],
          {
            roomId: waitingRoom.id,
            stakeToken: waitingRoom.stakeToken,
            stakeAmount: waitingRoom.stakeAmount,
          },
        );
      }, MODAL_DISMISS_MS);
    });
    return () => {
      offJoined();
      offLeft();
      offStarted();
    };
  }, [onSocketEvent, clearWaitingRoom, navigation]);

  const handleRejoin = useCallback(
    (room: GameRoomSummary) => {
      (navigation.navigate as (screen: string, params: unknown) => void)(
        GAME_TYPE_SCREENS[room.gameType],
        {
          roomId: room.id,
          stakeToken: room.stakeToken,
          stakeAmount: room.stakeAmount,
        },
      );
    },
    [navigation],
  );

  useEffect(() => {
    return onSocketEvent('game:opponent-joined', payload => {
      const roomId =
        payload && typeof payload === 'object' && 'roomId' in payload
          ? (payload as { roomId: unknown }).roomId
          : undefined;
      if (typeof roomId !== 'string') {
        return;
      }
      const waitingRoom = useGameStore.getState().waitingRoom;
      clearWaitingRoom();
      if (!waitingRoom) {
        return;
      }
      setTimeout(() => {
        (navigation.navigate as (screen: string, params: unknown) => void)(
          GAME_TYPE_SCREENS[waitingRoom.gameType],
          {
            roomId,
            stakeToken: waitingRoom.stakeToken,
            stakeAmount: waitingRoom.stakeAmount,
          },
        );
      }, MODAL_DISMISS_MS);
    });
  }, [onSocketEvent, clearWaitingRoom, navigation]);

  return (
    <View style={{ flex: 1 }}>
      <ServerStatusBanner />
      <MainTabNavigator />
      {serverStatus === 'online' && (
        <>
          <WaitingForPlayersMinimizedBar />
          <WaitingForPlayersPopup />
          <ResumeMatchModal onRejoin={handleRejoin} />
          {/* Never alongside another native Modal. */}
          {welcomeOffer && !waitingRoom && !resumableMatch ? (
            <WelcomeBonusModal
              visible
              onClaimed={() => settleWelcomeOffer('claimed')}
              onDismissed={() => settleWelcomeOffer('dismissed')}
              onClose={() => setWelcomeOffer(false)}
            />
          ) : null}
        </>
      )}
    </View>
  );
}
