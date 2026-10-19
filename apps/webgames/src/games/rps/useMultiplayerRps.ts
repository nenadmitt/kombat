import {
  ApiError,
  resolveRound,
  RPS_EVENTS,
  type RpsEndReason,
  type RpsLockedPayload,
  type RpsMove,
  type RpsPresencePayload,
  type RpsRevealPayload,
} from '@gaming-platform/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiClient } from '../../lib/api';
import { useSessionStore } from '../../store/session.store';
import { useUsernames } from '../../store/usernames';
import { useWebsocketStore } from '../../store/websocket.store';
import { revealHeadline } from './reveal-headline';
import type { RpsEngine, RpsPlayProps, RpsStage } from './rps-engine';

type RevealInfo = NonNullable<RpsPlayProps['reveal']>;

type PendingNext = {
  round: number;
  deadline: number | null;
  scores: Record<string, number>;
  winnerUserId: string | null;
  endReason: RpsEndReason | null;
};

const SYNC_RETRY_MS = 3000;

export function useMultiplayerRps(roomId: string): RpsEngine {
  const { joinChannel, leaveChannel, on, emit } = useWebsocketStore();
  const status = useWebsocketStore(s => s.status);
  const myUserId = useSessionStore(s => s.user?.id) ?? null;

  const [opponentUserId, setOpponentUserId] = useState('');
  const [round, setRound] = useState(1);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [myMove, setMyMove] = useState<RpsMove | null>(null);
  const [opponentLocked, setOpponentLocked] = useState(false);
  const [stage, setStage] = useState<RpsStage>('choosing');
  const [reveal, setReveal] = useState<RevealInfo | null>(null);
  const [roundDeadline, setRoundDeadline] = useState<number | null>(null);
  const [opponentOnline, setOpponentOnline] = useState(false);
  const [winnerUserId, setWinnerUserId] = useState<string | null>(null);
  const [endReason, setEndReason] = useState<RpsEndReason | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [waitingError, setWaitingError] = useState<string | null>(null);

  const pendingRef = useRef<PendingNext | null>(null);
  const myUserIdRef = useRef(myUserId);
  myUserIdRef.current = myUserId;
  const opponentIdRef = useRef(opponentUserId);
  opponentIdRef.current = opponentUserId;

  const usernames = useUsernames(opponentUserId ? [opponentUserId] : []);
  const opponentName =
    (opponentUserId ? usernames[opponentUserId] : null) ?? 'Opponent';

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, [roomId]);

  const syncState = useCallback(async () => {
    try {
      const snapshot = await apiClient.getRpsRoomState(roomId);
      if (!mountedRef.current) return;
      setOpponentUserId(snapshot.opponentUserId);
      setRound(snapshot.round);
      setScores(snapshot.scores);
      setMyMove(snapshot.myMove);
      setOpponentLocked(snapshot.opponentLocked);
      setRoundDeadline(snapshot.roundDeadline);
      setOpponentOnline(snapshot.online[snapshot.opponentUserId] ?? false);
      setWinnerUserId(snapshot.winnerUserId);
      setEndReason(snapshot.endReason);
      setStage('choosing');
      setReveal(null);
      pendingRef.current = null;
      setWaitingError(null);
      setLoaded(true);
    } catch (err) {
      setWaitingError(
        err instanceof ApiError ? err.message : 'Could not reach the server.',
      );
    }
  }, [roomId]);

  useEffect(() => {
    const channel = `game:${roomId}`;
    joinChannel(channel);
    emit(RPS_EVENTS.enter, { roomId });

    const offLocked = on(RPS_EVENTS.locked, payload => {
      const event = payload as RpsLockedPayload;
      if (event.userId === opponentIdRef.current) setOpponentLocked(true);
    });

    const offReveal = on(RPS_EVENTS.reveal, payload => {
      const event = payload as RpsRevealPayload;
      const me = myUserIdRef.current;
      if (!me) return;
      const mine = event.moves[me] ?? null;
      const theirs = event.moves[opponentIdRef.current] ?? null;
      const outcome = resolveRound(mine, theirs);
      setScores(event.scores);
      setReveal({
        myMove: mine,
        opponentMove: theirs,
        result:
          outcome === 0 ? 'tie' : event.roundWinnerUserId === me ? 'win' : 'loss',
        headline: revealHeadline(mine, theirs, outcome),
      });
      setStage('revealing');
      setRoundDeadline(null);
      pendingRef.current = {
        round: event.nextRound,
        deadline: event.nextDeadline,
        scores: event.scores,
        winnerUserId: event.winnerUserId,
        endReason: event.winnerUserId ? 'complete' : null,
      };
    });

    const offPresence = on(RPS_EVENTS.presence, payload => {
      const event = payload as RpsPresencePayload;
      if (event.userId === opponentIdRef.current) setOpponentOnline(event.online);
    });

    const offEnded = on(RPS_EVENTS.ended, payload => {
      const event = payload as { winnerUserId: string | null; reason: RpsEndReason };
      setWinnerUserId(event.winnerUserId);
      setEndReason(event.reason);
      setStage('choosing');
      setReveal(null);
    });

    const offError = on(RPS_EVENTS.error, payload => {
      setWaitingError(
        (payload as { message?: string }).message ?? 'Something went wrong.',
      );
    });

    return () => {
      offLocked();
      offReveal();
      offPresence();
      offEnded();
      offError();
      leaveChannel(channel);
    };
    // `status` is a dependency: a forced reconnect replaces the socket instance.
  }, [roomId, joinChannel, leaveChannel, on, emit, status]);

  useEffect(() => {
    if (loaded) return;
    void syncState();
    const timer = setInterval(() => void syncState(), SYNC_RETRY_MS);
    return () => clearInterval(timer);
  }, [loaded, syncState]);

  const prevStatusRef = useRef(status);
  useEffect(() => {
    const was = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status !== 'connected' || was !== 'disconnected') return;
    emit(RPS_EVENTS.enter, { roomId });
    void syncState();
  }, [status, roomId, emit, syncState]);

  const onLock = useCallback(
    (move: RpsMove) => {
      if (myMove || stage !== 'choosing') return;
      setMyMove(move); // optimistic; the reveal is authoritative
      emit(RPS_EVENTS.lock, { roomId, move });
    },
    [roomId, emit, myMove, stage],
  );

  const onNextRound = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending?.winnerUserId) {
      setWinnerUserId(pending.winnerUserId);
      setEndReason(pending.endReason);
      return;
    }
    setStage('choosing');
    setReveal(null);
    setMyMove(null);
    setOpponentLocked(false);
    if (pending) {
      setRound(pending.round);
      setRoundDeadline(pending.deadline);
      setScores(pending.scores);
    }
  }, []);

  const forfeit = useCallback(() => {
    emit(RPS_EVENTS.forfeit, { roomId });
  }, [roomId, emit]);

  const result: 'win' | 'lose' | null = winnerUserId
    ? winnerUserId === myUserId
      ? 'win'
      : 'lose'
    : // A voided match (both players timed out) still ends as a loss for both.
      endReason === 'timeout'
      ? 'lose'
      : null;

  const playProps: RpsPlayProps = {
    opponent: {
      name: opponentName,
      initial: opponentName.charAt(0).toUpperCase(),
      online: opponentOnline,
    },
    myOnline: status === 'connected',
    round,
    myScore: myUserId ? (scores[myUserId] ?? 0) : 0,
    opponentScore: opponentUserId ? (scores[opponentUserId] ?? 0) : 0,
    myMove,
    opponentLocked,
    stage,
    reveal,
    roundDeadline: result ? null : roundDeadline,
    result,
    resultReason: result ? endReason : null,
    onLock,
    onNextRound,
  };

  return {
    phase: loaded ? 'play' : 'waiting',
    waitingError,
    forfeit,
    playProps,
  };
}
