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

/**
 * Multiplayer engine: everything flows through the single app websocket. The
 * board updates only when the server echoes a shot back.
 */
export function useMultiplayerBattleship(roomId: string): BattleshipEngine {
  const joinChannel = useWebsocketStore(s => s.joinChannel);
  const leaveChannel = useWebsocketStore(s => s.leaveChannel);
  const on = useWebsocketStore(s => s.on);
  const emit = useWebsocketStore(s => s.emit);
  const myUserId = useSessionStore(s => s.user?.id) ?? null;

  const [phase, setPhase] = useState<EnginePhase>('setup');
  /** True once the REST snapshot has landed at least once. */
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

  // The opponent's real username via the shared cache; placeholder until
  // resolved (or if they never picked one).
  const usernames = useUsernames(opponentUserId ? [opponentUserId] : []);
  const opponentName =
    (opponentUserId ? usernames[opponentUserId] : null) ?? 'Opponent';

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
      setMyMines(state.myMines ?? []);
      setMyShots(state.myShots);
      setOpponentShots(state.opponentShots);
      setRevealed(state.revealedOpponentShips);
      setPointsMap(state.points);
      setPowerupsUsedMap(state.powerupsUsed ?? {});
      setVolleysMap(state.volleys ?? {});
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
      setWaitingError(null);
      setSynced(true);
    } catch (err) {
      // A failed fetch used to silently leave the player in 'setup' - which,
      // on a resume into a live match, is the setup screen of a match already
      // in play. Keep retrying below and say why meanwhile.
      const message =
        err instanceof ApiError ? err.message : 'Could not reach the server.';
      setWaitingError(message);
    }
  }, [roomId]);

  useEffect(() => {
    const channel = `game:${roomId}`;
    joinChannel(channel);
    // Announce presence immediately (before fleet submission) so the opponent
    // shows as connected as soon as they open the match, not only once they've
    // placed their ships.
    emit(BATTLESHIP_EVENTS.enter, { roomId });

    // Gateway failures (enter, fire, ready) surface here; ignoring them is
    // how silent hangs happen.
    const offError = on(BATTLESHIP_EVENTS.error, raw => {
      const message =
        (raw as { message?: string }).message ?? 'Something went wrong.';
      setWaitingError(message);
    });

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
        // Replay the incoming shot on my fleet view (bomb/torpedo animations).
        opponentActionId.current += 1;
        setOpponentAction({
          id: opponentActionId.current,
          kind: p.kind,
          cells: p.cells,
        });
        if (mineBlasts.length > 0) {
          // The opponent struck MY mine(s): each blast tears into their own
          // board - free damage (and reveals) on my attack view - and the
          // struck mines are spent.
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
        // My shot echoed back - replay animation + reveal any sinks.
        setMyShots(prev => [...prev, ...p.cells]);
        actionId.current += 1;
        setAction({ id: actionId.current, kind: p.kind, cells: p.cells });
        if (p.sunkShips.length > 0) {
          setRevealed(prev => [...prev, ...p.sunkShips]);
        }
        if (mineBlasts.length > 0) {
          // I struck the opponent's mine(s): each blast tears into MY board,
          // arriving as opponent shots on my fleet view.
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
    // `status` is a dependency because a forced reconnect replaces the socket
    // instance: handlers bound to the old one are gone, and without re-running
    // this the match goes silent while still looking connected.
  }, [roomId, joinChannel, leaveChannel, on, emit, status]);

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
    (placements: FleetPlacements, mines: MinePlacement[]) => {
      setMyPlacements(placements);
      setMyMines(mines);
      emit(BATTLESHIP_EVENTS.ready, { roomId, placements, mines });
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

  // The snapshot must eventually land: without it a resumed match renders the
  // wrong phase and a joiner has no turn state.
  useEffect(() => {
    if (synced) return;
    void syncState();
    const timer = setInterval(() => void syncState(), SYNC_RETRY_MS);
    return () => clearInterval(timer);
  }, [synced, syncState]);

  return {
    // A match can end during setup/waiting (forfeit or setup timeout) - jump
    // to the play phase so the result screen renders.
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
