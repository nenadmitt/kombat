import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  BATTLESHIP_EVENTS,
  type BattleshipEndReason,
  type EndedPayload,
  type FleetPlacements,
  type MinePlacement,
  type PowerupKind,
  type PresencePayload,
  type RevealedShip,
  type SetupStatePayload,
  type Shot,
  type ShotPayload,
  type StartPayload,
  type TurnTimeoutPayload,
  type VolleyStats,
  sunkShipIds,
} from '@gaming-platform/core';

import { apiClient } from '../../lib/api';
import { useSessionStore } from '../../store/session.store';
import { useUsernames } from '../../store/usernames';
import { useWebsocketStore } from '../../store/websocket.store';
import type {
  BattleshipEngine,
  EnginePhase,
  GridAction,
} from './battleship-engine';
import { revealedToPlaced, toPlacedShips } from './battleship-view';

const SYNC_RETRY_MS = 3000;

export function useMultiplayerBattleship(roomId: string): BattleshipEngine {
  const joinChannel = useWebsocketStore(s => s.joinChannel);
  const leaveChannel = useWebsocketStore(s => s.leaveChannel);
  const on = useWebsocketStore(s => s.on);
  const emit = useWebsocketStore(s => s.emit);
  const myUserId = useSessionStore(s => s.user?.id) ?? null;

  const [phase, setPhase] = useState<EnginePhase>('setup');
  const [synced, setSynced] = useState(false);
  const [waitingError, setWaitingError] = useState<string | null>(null);
  const [myPlacements, setMyPlacements] = useState<FleetPlacements | null>(null);
  const [myMines, setMyMines] = useState<MinePlacement[]>([]);
  const [myShots, setMyShots] = useState<Shot[]>([]);
  const [opponentShots, setOpponentShots] = useState<Shot[]>([]);
  const [revealed, setRevealed] = useState<RevealedShip[]>([]);
  const [pointsMap, setPointsMap] = useState<Record<string, number>>({});
  const [powerupsUsedMap, setPowerupsUsedMap] = useState<
    Record<string, Record<PowerupKind, number>>
  >({});
  const [volleysMap, setVolleysMap] = useState<Record<string, VolleyStats>>({});
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

  const usernames = useUsernames(opponentUserId ? [opponentUserId] : []);
  const opponentName =
    (opponentUserId ? usernames[opponentUserId] : null) ?? 'Opponent';

  const opponentIdRef = useRef(opponentUserId);
  opponentIdRef.current = opponentUserId;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, [roomId]);

  const syncState = useCallback(async () => {
    try {
      const state = await apiClient.getBattleshipRoomState(roomId);
      if (!mountedRef.current) {
        return;
      }
      setMyPlacements(state.myFleet);
      setMyMines(state.myMines ?? []);
      setMyShots(state.myShots);
      setOpponentShots(state.opponentShots);
      setRevealed(state.revealedOpponentShips);
      setPointsMap(state.points);
      setPowerupsUsedMap(state.powerupsUsed ?? {});
      setVolleysMap(state.volleys ?? {});
      setTurnUserId(state.turnUserId);
      setTurnDeadline(state.turnDeadline);
      // Older servers omit this; null hides the countdown instead of showing 0:00.
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
      setWaitingError(null);
      setSynced(true);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Could not reach the server.';
      setWaitingError(message);
    }
  }, [roomId]);

  useEffect(() => {
    const channel = `game:${roomId}`;
    joinChannel(channel);
    emit(BATTLESHIP_EVENTS.enter, { roomId });

    const offError = on(BATTLESHIP_EVENTS.error, raw => {
      const message =
        (raw as { message?: string }).message ?? 'Something went wrong.';
      setWaitingError(message);
    });

    // The setup countdown arrives on enter; the REST snapshot can predate the match.
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
      const mineBlasts = p.mineBlasts ?? [];
      const blastCells = mineBlasts.flatMap(b => b.cells);
      setPointsMap(p.points);
      setPowerupsUsedMap(p.powerupsUsed ?? {});
      setVolleysMap(p.volleys ?? {});
      setTurnUserId(p.nextTurnUserId);
      setTurnDeadline(p.turnDeadline);
      if (p.winnerUserId) {
        setWinnerUserId(p.winnerUserId);
        setEndReason('complete');
      }
      if (p.byUserId === opponentIdRef.current) {
        setOpponentShots(prev => [...prev, ...p.cells]);
        opponentActionId.current += 1;
        setOpponentAction({
          id: opponentActionId.current,
          kind: p.kind,
          cells: p.cells,
        });
        if (mineBlasts.length > 0) {
          setMyShots(prev => [...prev, ...blastCells]);
          const blastSunk = mineBlasts.flatMap(b => b.sunkShips);
          if (blastSunk.length > 0) {
            setRevealed(prev => [...prev, ...blastSunk]);
          }
          setMyMines(prev =>
            prev.filter(
              m =>
                !mineBlasts.some(
                  b => b.center.row === m.row && b.center.col === m.col,
                ),
            ),
          );
          actionId.current += 1;
          setAction({ id: actionId.current, kind: 'mine', cells: blastCells });
        }
      } else {
        setMyShots(prev => [...prev, ...p.cells]);
        actionId.current += 1;
        setAction({ id: actionId.current, kind: p.kind, cells: p.cells });
        if (p.sunkShips.length > 0) {
          setRevealed(prev => [...prev, ...p.sunkShips]);
        }
        if (mineBlasts.length > 0) {
          setOpponentShots(prev => [...prev, ...blastCells]);
          opponentActionId.current += 1;
          setOpponentAction({
            id: opponentActionId.current,
            kind: 'mine',
            cells: blastCells,
          });
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
      offError();
      offSetupState();
      offStart();
      offShot();
      offTimeout();
      offPresence();
      offEnded();
      leaveChannel(channel);
    };
    // `status` is a dependency: a forced reconnect replaces the socket instance.
  }, [roomId, joinChannel, leaveChannel, on, emit, status]);

  // Resync after a reconnect; the initial connect is skipped since the mount effect covers it.
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
    (placements: FleetPlacements, mines: MinePlacement[]) => {
      setMyPlacements(placements);
      setMyMines(mines);
      emit(BATTLESHIP_EVENTS.ready, { roomId, placements, mines });
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
  const myPoints = myUserId ? (pointsMap[myUserId] ?? 0) : 0;
  const myPowerupsUsed = (myUserId ? powerupsUsedMap[myUserId] : null) ?? {
    torpedo: 0,
    bomb: 0,
  };
  const myVolleys = (myUserId ? volleysMap[myUserId] : null) ?? {
    fired: 0,
    hit: 0,
  };

  const result: 'win' | 'lose' | null = winnerUserId
    ? winnerUserId === myUserId
      ? 'win'
      : 'lose'
    : // A voided match (nobody deployed) still ends as a loss for both sides.
      endReason === 'setup-timeout'
      ? 'lose'
      : null;
  const myTurn =
    phase === 'play' && !result && turnUserId !== null && turnUserId === myUserId;

  useEffect(() => {
    if (synced) return;
    void syncState();
    const timer = setInterval(() => void syncState(), SYNC_RETRY_MS);
    return () => clearInterval(timer);
  }, [synced, syncState]);

  return {
    phase: result ? 'play' : phase,
    waitingError,
    submitFleet,
    forfeit,
    setupDeadline,
    playProps: {
      myFleet,
      myMines,
      myShots,
      opponentShots,
      revealedEnemyShips,
      points: myPoints,
      powerupsUsed: myPowerupsUsed,
      volleys: myVolleys,
      myTurn,
      action,
      opponentAction,
      opponent: {
        initial: opponentName.charAt(0).toUpperCase(),
        name: opponentName,
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
