import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HOME_PROGRESS,
  LUDO_EVENTS,
  type LudoColor,
  type LudoEliminatedPayload,
  type LudoEndReason,
  type LudoMovedPayload,
  type LudoPlayer,
  type LudoPresencePayload,
  type LudoRolledPayload,
  type LudoStage,
  type LudoTokens,
  type LudoTurnTimeoutPayload,
} from '@gaming-platform/core';

import { apiClient } from '../../api/client';
import { useCurrentUserStore } from '../../store/currentUser.store';
import { useUsernames, usernameCache } from '../../store/username-cache';
import { useWebsocketStore } from '../../store/websocket.store';
import { LUDO_COLOR_NAMES } from './ludo-theme';
import type { LudoEngine, LudoSeatView } from './ludo-engine';

/**
 * Multiplayer Ludo engine: everything flows through the single app socket.
 * The server owns the dice and the whole state machine; the client renders
 * pushes and replaces its state wholesale from the REST snapshot on mount
 * and after every reconnect. Unlike Battleship there can be four players, so
 * "which seat is mine" comes from the profile's userId, not an
 * everyone-but-the-opponent trick.
 */
export function useMultiplayerLudo(roomId: string): LudoEngine {
  const joinChannel = useWebsocketStore(s => s.joinChannel);
  const leaveChannel = useWebsocketStore(s => s.leaveChannel);
  const on = useWebsocketStore(s => s.on);
  const emit = useWebsocketStore(s => s.emit);
  const status = useWebsocketStore(s => s.status);
  const myUserId = useCurrentUserStore(s => s.userId);

  const [players, setPlayers] = useState<LudoPlayer[]>([]);
  const [tokens, setTokens] = useState<LudoTokens>({});
  const [turnUserId, setTurnUserId] = useState<string | null>(null);
  const [stage, setStage] = useState<LudoStage>('roll');
  const [die, setDie] = useState<number | null>(null);
  const [rollId, setRollId] = useState(0);
  const [movable, setMovable] = useState<number[]>([]);
  const [eliminated, setEliminated] = useState<LudoColor[]>([]);
  const [online, setOnline] = useState<Record<string, boolean>>({});
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [winnerUserId, setWinnerUserId] = useState<string | null>(null);
  const [endReason, setEndReason] = useState<LudoEndReason | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [myCaptures, setMyCaptures] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Seat usernames resolve through the shared cache (usually already warm).
  const usernames = useUsernames(players.map(p => p.userId));

  // Socket handlers read these without re-subscribing.
  const myUserIdRef = useRef(myUserId);
  myUserIdRef.current = myUserId;
  const playersRef = useRef(players);
  playersRef.current = players;

  const nameOf = useCallback((userId: string): string => {
    if (userId === myUserIdRef.current) {
      return 'You';
    }
    const username = usernameCache.usernameOf(userId);
    if (username) {
      return username;
    }
    const seat = playersRef.current.find(p => p.userId === userId);
    return seat ? LUDO_COLOR_NAMES[seat.color] : 'Player';
  }, []);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, [roomId]);

  /** Replace local state with the authoritative snapshot (mount + reconnect). */
  const syncState = useCallback(async () => {
    try {
      const state = await apiClient.getLudoRoomState(roomId);
      if (!mountedRef.current) {
        return;
      }
      setPlayers(state.players);
      setTokens(state.tokens);
      setTurnUserId(state.turnUserId);
      setStage(state.stage);
      setDie(state.die);
      setMovable(state.movableTokens);
      setEliminated(state.eliminated);
      setOnline(state.online);
      setTurnDeadline(state.turnDeadline);
      setWinnerUserId(state.winnerUserId);
      setEndReason(state.endReason);
      setLoaded(true);
    } catch {
      // Transient - the next reconnect/mount retries.
    }
  }, [roomId]);

  useEffect(() => {
    const channel = `game:${roomId}`;
    joinChannel(channel);
    emit(LUDO_EVENTS.enter, { roomId });
    void syncState();

    const offRolled = on(LUDO_EVENTS.rolled, payload => {
      const p = payload as LudoRolledPayload;
      setDie(p.die);
      setRollId(id => id + 1);
      setStage(p.stage);
      setTurnUserId(p.nextTurnUserId);
      setTurnDeadline(p.turnDeadline);
      setMovable(p.byUserId === myUserIdRef.current ? p.movableTokens : []);
      if (p.thirdSix) {
        setNotice(`${nameOf(p.byUserId)} rolled three sixes - turn lost`);
      } else if (p.movableTokens.length === 0 && p.stage === 'roll' && p.nextTurnUserId !== p.byUserId) {
        setNotice(`${nameOf(p.byUserId)} rolled ${p.die} - no moves`);
      } else {
        setNotice(null);
      }
    });
    const offMoved = on(LUDO_EVENTS.moved, payload => {
      const p = payload as LudoMovedPayload;
      setTokens(p.tokens);
      setStage(p.stage);
      setTurnUserId(p.nextTurnUserId);
      setTurnDeadline(p.turnDeadline);
      setMovable([]);
      if (p.captures.length > 0) {
        setNotice(
          `${nameOf(p.byUserId)} captured ${p.captures
            .map(c => LUDO_COLOR_NAMES[c.color])
            .join(' & ')}!`,
        );
        if (p.byUserId === myUserIdRef.current) {
          setMyCaptures(count => count + p.captures.length);
        }
      } else {
        setNotice(null);
      }
      if (p.winnerUserId) {
        setWinnerUserId(p.winnerUserId);
        setEndReason('complete');
      }
    });
    const offTimeout = on(LUDO_EVENTS.turnTimeout, payload => {
      const p = payload as LudoTurnTimeoutPayload;
      setTokens(p.tokens);
      setTurnUserId(p.nextTurnUserId);
      setTurnDeadline(p.turnDeadline);
      setStage('roll');
      setMovable([]);
      if (p.eliminatedColor) {
        setEliminated(prev => [...prev, p.eliminatedColor!]);
        setNotice(`${nameOf(p.timedOutUserId)} timed out of the match`);
      } else {
        setNotice(`${nameOf(p.timedOutUserId)} ran out of time`);
      }
      if (p.winnerUserId) {
        setWinnerUserId(p.winnerUserId);
        setEndReason('timeout');
      }
    });
    const offEliminated = on(LUDO_EVENTS.eliminated, payload => {
      const p = payload as LudoEliminatedPayload;
      setTokens(p.tokens);
      setTurnUserId(p.nextTurnUserId);
      setTurnDeadline(p.turnDeadline);
      setStage('roll');
      setEliminated(prev =>
        prev.includes(p.color) ? prev : [...prev, p.color],
      );
      setNotice(`${nameOf(p.userId)} left the match`);
      if (p.winnerUserId) {
        setWinnerUserId(p.winnerUserId);
        setEndReason('forfeit');
      }
    });
    const offPresence = on(LUDO_EVENTS.presence, payload => {
      const p = payload as LudoPresencePayload;
      setOnline(prev => ({ ...prev, [p.userId]: p.online }));
    });
    const offEnded = on(LUDO_EVENTS.ended, payload => {
      const p = payload as { winnerUserId: string; reason: LudoEndReason };
      setWinnerUserId(p.winnerUserId);
      setEndReason(p.reason);
    });

    return () => {
      offRolled();
      offMoved();
      offTimeout();
      offEliminated();
      offPresence();
      offEnded();
      leaveChannel(channel);
    };
  }, [roomId, joinChannel, leaveChannel, on, emit, syncState, nameOf]);

  // Resync after a reconnect - pushes missed while offline are covered by
  // the snapshot (same pattern as the battleship engine).
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const was = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status !== 'connected' || was !== 'disconnected') {
      return;
    }
    emit(LUDO_EVENTS.enter, { roomId });
    void syncState();
  }, [status, roomId, emit, syncState]);

  const onRoll = useCallback(() => {
    emit(LUDO_EVENTS.roll, { roomId });
  }, [roomId, emit]);
  const onMoveToken = useCallback(
    (tokenIndex: number) => {
      emit(LUDO_EVENTS.move, { roomId, tokenIndex });
    },
    [roomId, emit],
  );
  const forfeit = useCallback(() => {
    emit(LUDO_EVENTS.forfeit, { roomId });
  }, [roomId, emit]);

  const mySeat = players.find(p => p.userId === myUserId) ?? null;
  const myColor = mySeat?.color ?? 'red';
  const iAmEliminated = mySeat ? eliminated.includes(mySeat.color) : false;

  const result: 'win' | 'lose' | null = winnerUserId
    ? winnerUserId === myUserId
      ? 'win'
      : 'lose'
    : iAmEliminated
      ? 'lose'
      : null;
  const resultReason: LudoEndReason | null = result
    ? winnerUserId && winnerUserId !== myUserId && !iAmEliminated
      ? 'complete'
      : (endReason ?? 'complete')
    : null;

  const seats: LudoSeatView[] = players.map(p => {
    const name =
      p.userId === myUserId
        ? 'You'
        : (usernames[p.userId] ?? LUDO_COLOR_NAMES[p.color]);
    return {
      userId: p.userId,
      color: p.color,
      name,
      initial: name.charAt(0).toUpperCase(),
      isMe: p.userId === myUserId,
      online:
        p.userId === myUserId
          ? status === 'connected'
          : (online[p.userId] ?? false),
      eliminated: eliminated.includes(p.color),
      homeCount: (tokens[p.color] ?? []).filter(pr => pr === HOME_PROGRESS)
        .length,
    };
  });

  const myTurn =
    !result && loaded && turnUserId !== null && turnUserId === myUserId;

  return {
    phase: loaded ? 'play' : 'waiting',
    forfeit,
    playProps: {
      seats,
      tokens,
      eliminatedColors: eliminated,
      myColor,
      turnColor: result
        ? null
        : (players.find(p => p.userId === turnUserId)?.color ?? null),
      myTurn,
      stage,
      die,
      rollId,
      movableTokens: myTurn ? movable : [],
      notice,
      turnDeadline: result ? null : turnDeadline,
      result,
      resultReason,
      winnerName: winnerUserId ? nameOf(winnerUserId) : null,
      myCaptures,
      onRoll,
      onMoveToken,
    },
  };
}
