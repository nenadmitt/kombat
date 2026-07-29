import { useCallback, useEffect, useRef, useState } from 'react';
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

import { apiClient } from '../../api/client';
import { useCurrentUserStore } from '../../store/currentUser.store';
import { useUsernames } from '../../store/username-cache';
import { useWebsocketStore } from '../../store/websocket.store';
import { useMatchSyncRetry } from '../use-match-sync-retry';
import { revealHeadline } from './reveal-headline';
import type { RpsEngine, RpsPlayProps, RpsStage } from './rps-engine';

type RevealInfo = NonNullable<RpsPlayProps['reveal']>;

/** What a reveal leaves pending until the player taps Next Round. */
type PendingNext = {
  round: number;
  deadline: number | null;
  scores: Record<string, number>;
  winnerUserId: string | null;
  endReason: RpsEndReason | null;
};

/**
 * Multiplayer Triple Cut engine: the server owns the dice-less-but-secret
 * lock-in and reveals only once both are in. The client renders pushes and
 * replaces state wholesale from the REST snapshot on mount and reconnect. My
 * seat is resolved by my own userId (there are exactly two players).
 */
export function useMultiplayerRps(roomId: string): RpsEngine {
  const joinChannel = useWebsocketStore(s => s.joinChannel);
  const leaveChannel = useWebsocketStore(s => s.leaveChannel);
  const on = useWebsocketStore(s => s.on);
  const emit = useWebsocketStore(s => s.emit);
  const status = useWebsocketStore(s => s.status);
  const myUserId = useCurrentUserStore(s => s.userId);

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

  // A reveal advances the server immediately; the client holds it until Next
  // Round, so the next round's info waits here.
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
      const s = await apiClient.getRpsRoomState(roomId);
      if (!mountedRef.current) {
        return;
      }
      setOpponentUserId(s.opponentUserId);
      setRound(s.round);
      setScores(s.scores);
      setMyMove(s.myMove);
      setOpponentLocked(s.opponentLocked);
      setRoundDeadline(s.roundDeadline);
      setOpponentOnline(s.online[s.opponentUserId] ?? false);
      setWinnerUserId(s.winnerUserId);
      setEndReason(s.endReason);
      // A resync always lands on the live choosing state; any in-flight reveal
      // is superseded by the authoritative snapshot.
      setStage('choosing');
      setReveal(null);
      pendingRef.current = null;
      setWaitingError(null);
      setLoaded(true);
    } catch (err) {
      // Keep retrying (useMatchSyncRetry), but say WHY on the waiting screen
      // - a silent catch here is how "stuck on a spinner" bugs stay unsolvable.
      const message =
        err instanceof ApiError ? err.message : 'Could not reach the server.';
      console.warn('[match-sync] snapshot fetch failed:', message);
      setWaitingError(message);
    }
  }, [roomId]);

  useEffect(() => {
    const channel = `game:${roomId}`;
    joinChannel(channel);
    emit(RPS_EVENTS.enter, { roomId });

    const offLocked = on(RPS_EVENTS.locked, payload => {
      const p = payload as RpsLockedPayload;
      if (p.userId === opponentIdRef.current) {
        setOpponentLocked(true);
      }
    });
    const offReveal = on(RPS_EVENTS.reveal, payload => {
      const p = payload as RpsRevealPayload;
      const me = myUserIdRef.current!;
      const opp = opponentIdRef.current;
      const mine = p.moves[me] ?? null;
      const theirs = p.moves[opp] ?? null;
      const outcome = resolveRound(mine, theirs);
      const result: RevealInfo['result'] =
        outcome === 0 ? 'tie' : p.roundWinnerUserId === me ? 'win' : 'loss';
      const headline = revealHeadline(mine, theirs, outcome);
      setScores(p.scores);
      setReveal({ myMove: mine, opponentMove: theirs, result, headline });
      setStage('revealing');
      setRoundDeadline(null);
      pendingRef.current = {
        round: p.nextRound,
        deadline: p.nextDeadline,
        scores: p.scores,
        winnerUserId: p.winnerUserId,
        endReason: p.winnerUserId ? 'complete' : null,
      };
    });
    const offPresence = on(RPS_EVENTS.presence, payload => {
      const p = payload as RpsPresencePayload;
      if (p.userId === opponentIdRef.current) {
        setOpponentOnline(p.online);
      }
    });
    // Gateway failures (enter and every action) surface here; the
    // client ignored them entirely before, which is how silent hangs
    // happen.
    const offGatewayError = on(RPS_EVENTS.error, raw => {
      const message =
        (raw as { message?: string }).message ?? 'Something went wrong.';
      console.warn('[rps] server error:', message);
      setWaitingError(message);
    });

    const offEnded = on(RPS_EVENTS.ended, payload => {
      const p = payload as { winnerUserId: string; reason: RpsEndReason };
      // Forfeit/timeout end with no reveal to show - jump straight to result.
      setWinnerUserId(p.winnerUserId);
      setEndReason(p.reason);
      setStage('choosing');
      setReveal(null);
    });

    return () => {
      offLocked();
      offReveal();
      offPresence();
      offEnded();
      offGatewayError();
      leaveChannel(channel);
    };
  }, [roomId, joinChannel, leaveChannel, on, emit, syncState]);

  // A failed first fetch used to be permanent: nothing retried while the
  // socket stayed healthy, leaving the player on the spinner all match.
  useMatchSyncRetry(syncState, loaded);

  const prevStatusRef = useRef(status);
  useEffect(() => {
    const was = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status !== 'connected' || was !== 'disconnected') {
      return;
    }
    emit(RPS_EVENTS.enter, { roomId });
    void syncState();
  }, [status, roomId, emit, syncState]);

  const onLock = useCallback(
    (move: RpsMove) => {
      if (myMove || stage !== 'choosing') {
        return;
      }
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

  const myScore = myUserId ? (scores[myUserId] ?? 0) : 0;
  const opponentScore = opponentUserId ? (scores[opponentUserId] ?? 0) : 0;
  const result: 'win' | 'lose' | null = winnerUserId
    ? winnerUserId === myUserId
      ? 'win'
      : 'lose'
    : null;

  const playProps: RpsPlayProps = {
    opponent: {
      name: opponentName,
      initial: opponentName.charAt(0).toUpperCase(),
      online: opponentOnline,
    },
    myOnline: status === 'connected',
    round,
    myScore,
    opponentScore,
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

  return { phase: loaded ? 'play' : 'waiting', waitingError, forfeit, playProps };
}
