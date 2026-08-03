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
  const clearWaitingRoom = useGameStore(state => state.clear);
  const onSocketEvent = useWebsocketStore(state => state.on);
  const confirm = useConfirm();
  const serverStatus = useServerStore(state => state.status);
  const waitingRoom = useGameStore(state => state.waitingRoom);
  const resumableMatch = useGameStore(state => state.resumableMatch);
  const userId = useCurrentUserStore(state => state.userId);

  // The welcome bonus offer, shown until the user claims or forfeits it.
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

  // Maintenance toggles arrive as a broadcast so every client flips its
  // banner immediately, without waiting for the next /status poll.
  useEffect(() => {
    return onSocketEvent(PLATFORM_EVENTS.maintenance, payload => {
      if (payload && typeof payload === 'object' && 'maintenance' in payload) {
        useServerStore
          .getState()
          .applyPlatformStatus(payload as PlatformStatus);
      }
    });
  }, [onSocketEvent]);

  // Pot balance changes (deposit credited, stake held, prize paid, withdrawal
  // confirmed) arrive as a full snapshot, so the wallet screen is already
  // correct whenever the user next opens it.
  useEffect(() => {
    return onSocketEvent(STAKE_POT_EVENTS.balance, payload => {
      if (payload && typeof payload === 'object' && 'available' in payload) {
        useStakePotStore.getState().apply(payload as StakePotBalances);
      }
    });
  }, [onSocketEvent]);

  // A staked join that could not be funded. The joiner learns from their own
  // failed request; the creator only finds out here.
  useEffect(() => {
    const offFailed = onSocketEvent(STAKE_EVENTS.failed, payload => {
      // Only the creator holds a waitingRoom.
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
    return offFailed;
  }, [onSocketEvent, clearWaitingRoom, confirm]);

  useEffect(() => {
    apiClient
      .getMyActiveGameRoom()
      .then(room => {
        if (!room) {
          return;
        }
        // A Pending room means we're still waiting for players (resume the
        // waiting popup); an InProgress one is a live match to rejoin/forfeit.
        if (room.status === GameRoomStatus.InProgress) {
          setResumableMatch(room);
        } else {
          // In a Ludo room the user may be a joiner, not the creator - that
          // flips the popup's Cancel to Leave and hides Start.
          const myUserId = useCurrentUserStore.getState().userId;
          setWaitingRoom(room, myUserId !== null && room.creatorUserId !== myUserId);
        }
      })
      .catch(() => {
        // Non-critical - just means we won't resume anything this session.
      });
  }, [setWaitingRoom, setResumableMatch]);

  // Multi-player (Ludo) waiting-room lifecycle: roster pushes keep the
  // popup's count fresh; the started push transfers everyone into the match.
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
      // Dismiss the popup first, then transfer once its Modal has faded out.
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

  // Fired by ResumeMatchModal only after its Modal has fully dismissed -
  // navigating earlier would overlap two native transitions and wedge iOS
  // touches. The modal also owns clearing the store, so this just navigates.
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
      // Same dismiss-then-navigate serialization as the multi-seat path.
      setTimeout(() => {
        // Same dynamic-route-name cast as GameLobyScreen's join handler.
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
      {/* Multiplayer overlays make no sense while multiplayer is gated - a
          waiting room can't fill and a match can't be (re)joined. */}
      {serverStatus === 'online' && (
        <>
          <WaitingForPlayersMinimizedBar />
          <WaitingForPlayersPopup />
          <ResumeMatchModal onRejoin={handleRejoin} />
          {/* Never alongside another native Modal (CLAUDE.md rule 5). A fresh
              account has neither overlay, so in practice this shows first. */}
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
