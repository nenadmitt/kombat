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

import { apiClient } from '../../../api/client';
import { useUsernames } from '../../../store/username-cache';
import { useWebsocketStore } from '../../../store/websocket.store';
import { useMatchSyncRetry } from '../../use-match-sync-retry';
import type { GridAction } from '../BattleshipGrid';
import type { BattleshipEngine, EnginePhase } from './battleship-engine';
import { revealedToPlaced, toPlacedShips } from './battleship-view';

/** Exactly two players, so "not the opponent" means "me" without needing our own userId. */
export function useMultiplayerBattleship(roomId: string): BattleshipEngine {
  const joinChannel = useWebsocketStore(s => s.joinChannel);
  const leaveChannel = useWebsocketStore(s => s.leaveChannel);
  const on = useWebsocketStore(s => s.on);
  const emit = useWebsocketStore(s => s.emit);

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
      // Older servers omit the deadline; null hides the countdown instead of rendering 0:00.
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
      console.warn('[match-sync] snapshot fetch failed:', message);
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
      console.warn('[battleship] server error:', message);
      setWaitingError(message);
    });

    // The server pushes the setup countdown on enter; the REST snapshot can be fetched before the match exists.
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
  }, [roomId, joinChannel, leaveChannel, on, emit, syncState]);

  // Resync after a reconnect; the initial connect is skipped because the mount effect already did it.
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
  const myPoints = useMemo(() => {
    const mine = Object.entries(pointsMap).find(
      ([id]) => id !== opponentUserId,
    );
    return mine ? mine[1] : 0;
  }, [pointsMap, opponentUserId]);
  const myPowerupsUsed = useMemo(() => {
    const mine = Object.entries(powerupsUsedMap).find(
      ([id]) => id !== opponentUserId,
    );
    return mine ? mine[1] : { torpedo: 0, bomb: 0 };
  }, [powerupsUsedMap, opponentUserId]);
  const myVolleys = useMemo(() => {
    const mine = Object.entries(volleysMap).find(
      ([id]) => id !== opponentUserId,
    );
    return mine ? mine[1] : { fired: 0, hit: 0 };
  }, [volleysMap, opponentUserId]);

  const result: 'win' | 'lose' | null = winnerUserId
    ? winnerUserId === opponentUserId
      ? 'lose'
      : 'win'
    :
      endReason === 'setup-timeout'
      ? 'lose'
      : null;
  const myTurn =
    phase === 'play' &&
    !result &&
    turnUserId !== null &&
    turnUserId !== opponentUserId;

  useMatchSyncRetry(syncState, synced);

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
