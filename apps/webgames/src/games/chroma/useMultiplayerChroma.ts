import {
  ApiError,
  CHROMA_EVENTS,
  playableIndexes,
  type ChromaCard,
  type ChromaColorPickedPayload,
  type ChromaDirection,
  type ChromaDrewPayload,
  type ChromaEliminatedPayload,
  type ChromaEndReason,
  type ChromaEndedPayload,
  type ChromaHandPayload,
  type ChromaPassedPayload,
  type ChromaPlayedPayload,
  type ChromaPresencePayload,
  type ChromaSeat,
  type ChromaStage,
  type ChromaSuit,
  type ChromaTableState,
  type ChromaTurnTimeoutPayload,
} from '@gaming-platform/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiClient } from '../../lib/api';
import { useSessionStore } from '../../store/session.store';
import { useUsernames } from '../../store/usernames';
import { useWebsocketStore } from '../../store/websocket.store';
import { describeCard } from './chroma-theme';
import type { ChromaEngine, ChromaSeatView } from './chroma-engine';

const SYNC_RETRY_MS = 3000;

/**
 * Multiplayer Chroma engine: the server owns the deck and every rule, so this
 * client only emits and renders. There are no optimistic updates - a play, a
 * draw or a pass changes nothing on screen until the broadcast lands. Hands
 * are hidden: broadcasts carry counts, my real cards arrive only on the
 * caller-only `chroma:hand` push.
 */
export function useMultiplayerChroma(roomId: string): ChromaEngine {
  const joinChannel = useWebsocketStore(s => s.joinChannel);
  const leaveChannel = useWebsocketStore(s => s.leaveChannel);
  const on = useWebsocketStore(s => s.on);
  const emit = useWebsocketStore(s => s.emit);
  const status = useWebsocketStore(s => s.status);
  const myUserId = useSessionStore(s => s.user?.id) ?? null;

  const [players, setPlayers] = useState<ChromaSeat[]>([]);
  const [myHand, setMyHand] = useState<ChromaCard[]>([]);
  const [handCounts, setHandCounts] = useState<Record<string, number>>({});
  const [discardTop, setDiscardTop] = useState<ChromaCard | null>(null);
  const [activeSuit, setActiveSuit] = useState<ChromaSuit>('crimson');
  const [direction, setDirection] = useState<ChromaDirection>(1);
  const [drawPileCount, setDrawPileCount] = useState(0);
  const [stage, setStage] = useState<ChromaStage>('play');
  const [pendingColorUserId, setPendingColorUserId] = useState<string | null>(null);
  const [turnUserId, setTurnUserId] = useState<string | null>(null);
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [myDrawnIndex, setMyDrawnIndex] = useState<number | null>(null);
  const [eliminated, setEliminated] = useState<string[]>([]);
  const [online, setOnline] = useState<Record<string, boolean>>({});
  const [winnerUserId, setWinnerUserId] = useState<string | null>(null);
  const [endReason, setEndReason] = useState<ChromaEndReason | null>(null);
  /** Why *I* went out, which is not the winner's reason. */
  const [myExitReason, setMyExitReason] = useState<ChromaEndReason | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [waitingError, setWaitingError] = useState<string | null>(null);

  const usernames = useUsernames(players.map(p => p.userId));

  // Socket handlers read these without re-subscribing.
  const myUserIdRef = useRef(myUserId);
  myUserIdRef.current = myUserId;
  const usernamesRef = useRef(usernames);
  usernamesRef.current = usernames;
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;

  const nameOf = useCallback((userId: string): string => {
    if (userId === myUserIdRef.current) return 'You';
    return usernamesRef.current[userId] ?? 'Player';
  }, []);

  /** Every broadcast refreshes the shared table state the same way. */
  const applyTable = useCallback((t: ChromaTableState) => {
    setHandCounts(t.handCounts);
    setDiscardTop(t.discardTop);
    setActiveSuit(t.activeSuit);
    setDirection(t.direction);
    setDrawPileCount(t.drawPileCount);
    setStage(t.stage);
    setPendingColorUserId(t.pendingColorUserId);
    setTurnUserId(t.nextTurnUserId);
    setTurnDeadline(t.turnDeadline);
    // The reason belongs to `chroma:ended`, one packet behind this one.
    if (t.winnerUserId) {
      setWinnerUserId(t.winnerUserId);
    }
    // Any table change invalidates a stale drawn-card restriction unless the
    // caller re-establishes it (the drew handler does, right after).
    setMyDrawnIndex(null);
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
      const s = await apiClient.getChromaRoomState(roomId);
      if (!mountedRef.current) return;
      setPlayers(s.players);
      setMyHand(s.myHand);
      setHandCounts(s.handCounts);
      setDiscardTop(s.discardTop);
      setActiveSuit(s.activeSuit);
      setDirection(s.direction);
      setDrawPileCount(s.drawPileCount);
      setStage(s.stage);
      setPendingColorUserId(s.pendingColorUserId);
      setTurnUserId(s.turnUserId);
      setTurnDeadline(s.turnDeadline);
      setMyDrawnIndex(s.myDrawnIndex);
      setEliminated(s.eliminatedUserIds);
      setOnline(s.online);
      setWinnerUserId(s.winnerUserId);
      setEndReason(s.endReason);
      setNotice(null);
      setWaitingError(null);
      setLoaded(true);
    } catch (err) {
      // Keep retrying, but say WHY on the waiting screen - a silent catch here
      // is how "stuck on a spinner" bugs stay unsolvable.
      setWaitingError(
        err instanceof ApiError ? err.message : 'Could not reach the server.',
      );
    }
  }, [roomId]);

  useEffect(() => {
    const channel = `game:${roomId}`;
    joinChannel(channel);
    emit(CHROMA_EVENTS.enter, { roomId });

    const offHand = on(CHROMA_EVENTS.hand, payload => {
      setMyHand((payload as ChromaHandPayload).cards);
    });

    const offPlayed = on(CHROMA_EVENTS.played, payload => {
      const p = payload as ChromaPlayedPayload;
      applyTable(p);
      const who = nameOf(p.byUserId);
      if (p.soloPenaltyDraws > 0) {
        setNotice(
          p.byUserId === myUserIdRef.current
            ? `You forgot SOLO - drew ${p.soloPenaltyDraws} penalty cards`
            : `${who} forgot SOLO - drew ${p.soloPenaltyDraws}`,
        );
      } else if (p.soloCalled) {
        setNotice(
          `${who} ${p.byUserId === myUserIdRef.current ? 'are' : 'is'} on SOLO!`,
        );
      } else {
        setNotice(`${who} played ${describeCard(p.card)}`);
      }
    });

    const offDrew = on(CHROMA_EVENTS.drew, payload => {
      const p = payload as ChromaDrewPayload;
      applyTable(p);
      if (p.byUserId === myUserIdRef.current && p.drawerMayAct) {
        setMyDrawnIndex((p.handCounts[p.byUserId] ?? 1) - 1);
        setNotice('Playable! Play it or keep it and pass');
      } else {
        setNotice(`${nameOf(p.byUserId)} drew a card`);
      }
    });

    const offPassed = on(CHROMA_EVENTS.passed, payload => {
      const p = payload as ChromaPassedPayload;
      applyTable(p);
      setNotice(`${nameOf(p.byUserId)} passed`);
    });

    const offColor = on(CHROMA_EVENTS.colorPicked, payload => {
      const p = payload as ChromaColorPickedPayload;
      applyTable(p);
      const victim =
        p.victimUserId && p.victimDraws > 0
          ? ` - ${nameOf(p.victimUserId).toLowerCase()} drew ${p.victimDraws}`
          : '';
      setNotice(`${nameOf(p.byUserId)} picked a colour${victim}`);
    });

    const offTimeout = on(CHROMA_EVENTS.turnTimeout, payload => {
      const p = payload as ChromaTurnTimeoutPayload;
      applyTable(p);
      const out = p.eliminatedUserId;
      if (out) {
        setEliminated(prev => (prev.includes(out) ? prev : [...prev, out]));
        if (out === myUserIdRef.current) {
          setMyExitReason('timeout');
        }
      }
      setNotice(
        out
          ? `${nameOf(p.timedOutUserId)} timed out and is eliminated`
          : `${nameOf(p.timedOutUserId)} timed out`,
      );
    });

    const offEliminated = on(CHROMA_EVENTS.eliminated, payload => {
      const p = payload as ChromaEliminatedPayload;
      applyTable(p);
      setEliminated(prev =>
        prev.includes(p.userId) ? prev : [...prev, p.userId],
      );
      if (p.userId === myUserIdRef.current) {
        setMyExitReason('forfeit');
      }
      setNotice(`${nameOf(p.userId)} left the match`);
    });

    const offPresence = on(CHROMA_EVENTS.presence, payload => {
      const p = payload as ChromaPresencePayload;
      setOnline(prev => ({ ...prev, [p.userId]: p.online }));
    });

    const offEnded = on(CHROMA_EVENTS.ended, payload => {
      const p = payload as ChromaEndedPayload;
      setWinnerUserId(p.winnerUserId);
      setEndReason(p.reason);
    });

    // Gateway failures ("not your turn", an unfunded stake) surface here rather
    // than hanging the screen. Past the waiting phase the notice line is the
    // only place left to show them.
    const offGatewayError = on(CHROMA_EVENTS.error, raw => {
      const message =
        (raw as { message?: string }).message ?? 'Something went wrong.';
      setWaitingError(message);
      if (loadedRef.current) {
        setNotice(message);
      }
    });

    return () => {
      offHand();
      offPlayed();
      offDrew();
      offPassed();
      offColor();
      offTimeout();
      offEliminated();
      offPresence();
      offEnded();
      offGatewayError();
      leaveChannel(channel);
    };
  }, [roomId, joinChannel, leaveChannel, on, emit, applyTable, nameOf]);

  // The snapshot must eventually land: without it the table renders empty and
  // a resumed match has no hand.
  useEffect(() => {
    if (loaded && discardTop !== null) return;
    void syncState();
    const timer = setInterval(() => void syncState(), SYNC_RETRY_MS);
    return () => clearInterval(timer);
  }, [loaded, discardTop, syncState]);

  // Pushes missed while offline are covered by a fresh snapshot.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const was = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status !== 'connected' || was !== 'disconnected') return;
    emit(CHROMA_EVENTS.enter, { roomId });
    void syncState();
  }, [status, roomId, emit, syncState]);

  const onPlay = useCallback(
    (handIndex: number, solo: boolean) => {
      emit(CHROMA_EVENTS.play, { roomId, handIndex, solo });
    },
    [roomId, emit],
  );
  const onDraw = useCallback(() => {
    emit(CHROMA_EVENTS.draw, { roomId });
  }, [roomId, emit]);
  const onPass = useCallback(() => {
    emit(CHROMA_EVENTS.pass, { roomId });
  }, [roomId, emit]);
  const onPickColor = useCallback(
    (suit: ChromaSuit) => {
      emit(CHROMA_EVENTS.pickColor, { roomId, suit });
    },
    [roomId, emit],
  );
  const forfeit = useCallback(() => {
    emit(CHROMA_EVENTS.forfeit, { roomId });
  }, [roomId, emit]);

  // The server only names a winner once one seat is left, so elimination has
  // to end my own match on its own.
  const iAmEliminated = myUserId ? eliminated.includes(myUserId) : false;

  const result: 'win' | 'lose' | null = winnerUserId
    ? winnerUserId === myUserId
      ? 'win'
      : 'lose'
    : iAmEliminated
      ? 'lose'
      : null;

  // `endReason` is relative to the winner, so it only describes my loss when I
  // am the one who went out.
  const resultReason: ChromaEndReason | null = !result
    ? null
    : iAmEliminated
      ? (myExitReason ?? 'complete')
      : winnerUserId && winnerUserId !== myUserId
        ? 'complete'
        : (endReason ?? 'complete');

  const seats: ChromaSeatView[] = players.map(p => {
    const isMe = p.userId === myUserId;
    const name = isMe ? 'You' : (usernames[p.userId] ?? 'Player');
    return {
      userId: p.userId,
      name,
      initial: name.charAt(0).toUpperCase(),
      isMe,
      online: isMe ? status === 'connected' : (online[p.userId] ?? false),
      eliminated: eliminated.includes(p.userId),
      cardCount: handCounts[p.userId] ?? 0,
      onTurn: !result && turnUserId === p.userId,
    };
  });

  const myTurn =
    !result && stage === 'play' && turnUserId !== null && turnUserId === myUserId;

  return {
    phase: loaded && discardTop !== null ? 'play' : 'waiting',
    waitingError,
    forfeit,
    playProps: {
      seats,
      myHand,
      playable: discardTop
        ? playableIndexes(myHand, activeSuit, discardTop.value)
        : [],
      myTurn,
      stage,
      activeSuit,
      discardTop: discardTop ?? { suit: 'crimson', value: '0' },
      drawPileCount,
      direction,
      myDrawnIndex,
      pickingColor: stage === 'pick-color' && pendingColorUserId === myUserId,
      notice,
      turnDeadline: result ? null : turnDeadline,
      result,
      resultReason,
      winnerName: winnerUserId ? nameOf(winnerUserId) : null,
      onPlay,
      onDraw,
      onPass,
      onPickColor,
    },
  };
}
