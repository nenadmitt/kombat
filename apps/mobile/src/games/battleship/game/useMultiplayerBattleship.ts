import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BATTLESHIP_EVENTS,
  type BattleshipEndReason,
  type EndedPayload,
  type FleetPlacements,
  type PresencePayload,
  type RevealedShip,
  type SetupStatePayload,
  type Shot,
  type ShotPayload,
  type StartPayload,
  type TurnTimeoutPayload,
  sunkShipIds,
} from '@gaming-platform/core';

import { apiClient } from '../../../api/client';
import { useWebsocketStore } from '../../../store/websocket.store';
import type { GridAction } from '../BattleshipGrid';
import type { BattleshipEngine, EnginePhase } from './battleship-engine';
import { revealedToPlaced, toPlacedShips } from './battleship-view';

/**
 * Multiplayer engine: everything flows through the single app websocket. The
 * board updates only when the server echoes a shot back. There are exactly two
 * players, so "not the opponent" means "me" - which avoids needing our own
 * userId on the client.
 */
export function useMultiplayerBattleship(roomId: string): BattleshipEngine {
  const joinChannel = useWebsocketStore(s => s.joinChannel);
  const leaveChannel = useWebsocketStore(s => s.leaveChannel);
  const on = useWebsocketStore(s => s.on);
  const emit = useWebsocketStore(s => s.emit);

  const [phase, setPhase] = useState<EnginePhase>('setup');
  const [myPlacements, setMyPlacements] = useState<FleetPlacements | null>(null);
  const [myShots, setMyShots] = useState<Shot[]>([]);
  const [opponentShots, setOpponentShots] = useState<Shot[]>([]);
  const [revealed, setRevealed] = useState<RevealedShip[]>([]);
  const [pointsMap, setPointsMap] = useState<Record<string, number>>({});
  const [turnUserId, setTurnUserId] = useState<string | null>(null);
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [setupDeadline, setSetupDeadline] = useState<number | null>(null);
  const [winnerUserId, setWinnerUserId] = useState<string | null>(null);
  const [endReason, setEndReason] = useState<BattleshipEndReason | null>(null);
  const [opponentUserId, setOpponentUserId] = useState<string>('');
  const [opponentOnline, setOpponentOnline] = useState(false);
  const [action, setAction] = useState<GridAction | null>(null);
  const actionId = useRef(0);
  const [opponentAction, setOpponentAction] = useState<GridAction | null>(null);
  const opponentActionId = useRef(0);

  const status = useWebsocketStore(s => s.status);

  // The delayed socket handlers read the opponent id via a ref.
  const opponentIdRef = useRef(opponentUserId);
  opponentIdRef.current = opponentUserId;

  // Flipped on unmount/room-change so in-flight snapshot fetches don't write
  // into a dead (or different room's) hook instance.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, [roomId]);

  /** Pull the authoritative snapshot and replace local state wholesale. Used
   *  on mount and again after every socket reconnect - any events broadcast
   *  while we were disconnected (shots, turn changes, a finished match) are
   *  covered by the snapshot instead of being lost. */
  const syncState = useCallback(async () => {
    try {
      const state = await apiClient.getBattleshipRoomState(roomId);
      if (!mountedRef.current) {
        return;
      }
      setMyPlacements(state.myFleet);
      setMyShots(state.myShots);
      setOpponentShots(state.opponentShots);
      setRevealed(state.revealedOpponentShips);
      setPointsMap(state.points);
      setTurnUserId(state.turnUserId);
      setTurnDeadline(state.turnDeadline);
      // Normalize a missing field (older server build) to null so the
      // waiting modal hides the countdown instead of rendering 0:00.
      setSetupDeadline(state.setupDeadline ?? null);
      setWinnerUserId(state.winnerUserId);
      setEndReason(state.endReason);
      setOpponentUserId(state.opponentUserId);
      setOpponentOnline(state.online[state.opponentUserId] ?? false);
      setPhase(
        state.phase === 'setup'
          ? state.myFleet
            ? 'waiting'
            : 'setup'
          : 'play',
      );
    } catch {
      // Happy path: assume the room exists; a failed fetch leaves us in setup.
    }
  }, [roomId]);

  useEffect(() => {
    const channel = `game:${roomId}`;
    joinChannel(channel);
    // Announce presence immediately (before fleet submission) so the opponent
    // shows as connected as soon as they open the match, not only once they've
    // placed their ships.
    emit(BATTLESHIP_EVENTS.enter, { roomId });

    void syncState();

    // The server pushes the setup countdown on enter - more reliable than the
    // REST snapshot, which can be fetched before the match exists.
    const offSetupState = on(BATTLESHIP_EVENTS.setupState, payload => {
      setSetupDeadline((payload as SetupStatePayload).setupDeadline);
    });
    const offStart = on(BATTLESHIP_EVENTS.start, payload => {
      const { firstTurnUserId, turnDeadline: deadline } = payload as StartPayload;
      setTurnUserId(firstTurnUserId);
      setTurnDeadline(deadline);
      setSetupDeadline(null);
      setPhase('play');
    });
    const offShot = on(BATTLESHIP_EVENTS.shot, payload => {
      const p = payload as ShotPayload;
      setPointsMap(p.points);
      setTurnUserId(p.nextTurnUserId);
      setTurnDeadline(p.turnDeadline);
      if (p.winnerUserId) {
        setWinnerUserId(p.winnerUserId);
        setEndReason('complete');
      }
      if (p.byUserId === opponentIdRef.current) {
        setOpponentShots(prev => [...prev, ...p.cells]);
        // Replay the incoming shot on my fleet view (bomb/torpedo animations).
        opponentActionId.current += 1;
        setOpponentAction({
          id: opponentActionId.current,
          kind: p.kind,
          cells: p.cells,
        });
      } else {
        // My shot echoed back - replay animation + reveal any sinks.
        setMyShots(prev => [...prev, ...p.cells]);
        actionId.current += 1;
        setAction({ id: actionId.current, kind: p.kind, cells: p.cells });
        if (p.sunkShips.length > 0) {
          setRevealed(prev => [...prev, ...p.sunkShips]);
        }
      }
    });
    const offTimeout = on(BATTLESHIP_EVENTS.turnTimeout, payload => {
      const p = payload as TurnTimeoutPayload;
      setTurnUserId(p.nextTurnUserId);
      setTurnDeadline(p.turnDeadline);
      if (p.winnerUserId) {
        setWinnerUserId(p.winnerUserId);
        setEndReason('timeout');
      }
    });
    const offPresence = on(BATTLESHIP_EVENTS.presence, payload => {
      const p = payload as PresencePayload;
      if (p.userId === opponentIdRef.current) {
        setOpponentOnline(p.online);
      }
    });
    const offEnded = on(BATTLESHIP_EVENTS.ended, payload => {
      const { winnerUserId: winner, reason } = payload as EndedPayload;
      // Winner is null only when neither fleet was deployed in time.
      setWinnerUserId(winner);
      setEndReason(reason);
    });

    return () => {
      offSetupState();
      offStart();
      offShot();
      offTimeout();
      offPresence();
      offEnded();
      leaveChannel(channel);
    };
  }, [roomId, joinChannel, leaveChannel, on, emit, syncState]);

  // Resync after a socket reconnect (network blip or server redeploy). The
  // store re-joins the game channel on `connect`; here we re-announce
  // presence (`enter`) and replace local state with the server snapshot to
  // cover any broadcasts missed while disconnected. The initial connection is
  // excluded ('connecting' → 'connected'): the mount effect already did this.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const was = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status !== 'connected' || was !== 'disconnected') {
      return;
    }
    emit(BATTLESHIP_EVENTS.enter, { roomId });
    void syncState();
  }, [status, roomId, emit, syncState]);

  const submitFleet = useCallback(
    (placements: FleetPlacements) => {
      setMyPlacements(placements);
      emit(BATTLESHIP_EVENTS.ready, { roomId, placements });
      // The authoritative flip to "play" (with turn info) comes from `start`.
      setPhase('waiting');
    },
    [roomId, emit],
  );

  const onFire = useCallback(
    (kind: ShotPayload['kind'], row: number, col: number) => {
      emit(BATTLESHIP_EVENTS.fire, { roomId, kind, row, col });
    },
    [roomId, emit],
  );

  const forfeit = useCallback(() => {
    emit(BATTLESHIP_EVENTS.forfeit, { roomId });
  }, [roomId, emit]);

  const myFleet = useMemo(
    () => (myPlacements ? toPlacedShips(myPlacements) : []),
    [myPlacements],
  );
  const revealedEnemyShips = useMemo(
    () => revealedToPlaced(revealed),
    [revealed],
  );
  const sunkByOpponent = useMemo(
    () => (myPlacements ? sunkShipIds(myPlacements, opponentShots).size : 0),
    [myPlacements, opponentShots],
  );
  const myPoints = useMemo(() => {
    const mine = Object.entries(pointsMap).find(
      ([id]) => id !== opponentUserId,
    );
    return mine ? mine[1] : 0;
  }, [pointsMap, opponentUserId]);

  const result: 'win' | 'lose' | null = winnerUserId
    ? winnerUserId === opponentUserId
      ? 'lose'
      : 'win'
    : // A voided match (nobody deployed) still ends as a loss for both sides.
      endReason === 'setup-timeout'
      ? 'lose'
      : null;
  const myTurn =
    phase === 'play' &&
    !result &&
    turnUserId !== null &&
    turnUserId !== opponentUserId;

  return {
    // A match can end during setup/waiting (forfeit or setup timeout) - jump
    // to the play phase so the result screen renders.
    phase: result ? 'play' : phase,
    submitFleet,
    forfeit,
    setupDeadline,
    playProps: {
      myFleet,
      myShots,
      opponentShots,
      revealedEnemyShips,
      points: myPoints,
      myTurn,
      action,
      opponentAction,
      opponent: {
        initial: opponentUserId ? opponentUserId.charAt(0).toUpperCase() : 'O',
        name: 'Opponent',
      },
      sunkByMe: revealed.length,
      sunkByOpponent,
      turnDeadline: result ? null : turnDeadline,
      myOnline: status === 'connected',
      opponentOnline,
      result,
      resultReason: result ? endReason : null,
      onFire,
    },
  };
}
