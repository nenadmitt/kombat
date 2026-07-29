import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  CHROMA_EVENTS,
  type ChromaCard,
  type ChromaColorPickedPayload,
  type ChromaDirection,
  type ChromaDrewPayload,
  type ChromaEliminatedPayload,
  type ChromaEndReason,
  type ChromaEndedPayload,
  type ChromaHandPayload,
  type ChromaPlayedPayload,
  type ChromaPassedPayload,
  type ChromaPresencePayload,
  type ChromaSeat,
  type ChromaStage,
  type ChromaSuit,
  type ChromaTableState,
  type ChromaTurnTimeoutPayload,
} from '@gaming-platform/core';

import { apiClient } from '../../api/client';
import { useCurrentUserStore } from '../../store/currentUser.store';
import { useUsernames, usernameCache } from '../../store/username-cache';
import { useWebsocketStore } from '../../store/websocket.store';
import { useMatchSyncRetry } from '../use-match-sync-retry';
import { describeCard } from './chroma-theme';
import type { ChromaEngine, ChromaPlayProps, ChromaSeatView } from './chroma-engine';

/**
 * Multiplayer engine: the server owns the deck and every rule; the client
 * renders pushes and replaces state wholesale from the REST snapshot on
 * mount and reconnect. Hands are hidden - broadcasts carry counts, my real
 * cards arrive only on the caller-only `chroma:hand` push.
 */
export function useMultiplayerChroma(roomId: string): ChromaEngine {
  const joinChannel = useWebsocketStore(s => s.joinChannel);
  const leaveChannel = useWebsocketStore(s => s.leaveChannel);
  const on = useWebsocketStore(s => s.on);
  const emit = useWebsocketStore(s => s.emit);
  const status = useWebsocketStore(s => s.status);
  const myUserId = useCurrentUserStore(s => s.userId);

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
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [waitingError, setWaitingError] = useState<string | null>(null);

  const myUserIdRef = useRef(myUserId);
  myUserIdRef.current = myUserId;

  const usernames = useUsernames(players.map(p => p.userId));

  const nameOf = useCallback((userId: string): string => {
    if (userId === myUserIdRef.current) {
      return 'You';
    }
    return usernameCache.usernameOf(userId) ?? 'Player';
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
    if (t.winnerUserId) {
      setWinnerUserId(t.winnerUserId);
      setEndReason('complete');
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

  const syncState = useCallback(async () => {
    try {
      const s = await apiClient.getChromaRoomState(roomId);
      if (!mountedRef.current) {
        return;
      }
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
        setNotice(`${who} ${p.byUserId === myUserIdRef.current ? 'are' : 'is'} on SOLO!`);
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
      setNotice(
        p.eliminatedUserId
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
      leaveChannel(channel);
    };
  }, [roomId, joinChannel, leaveChannel, on, emit, syncState, applyTable, nameOf]);

  // Timeout-eliminations also land in the snapshot's eliminatedUserIds; the
  // turnTimeout push covers the live case.
  useEffect(() => {
    const offTimeout = on(CHROMA_EVENTS.turnTimeout, payload => {
      const p = payload as ChromaTurnTimeoutPayload;
      if (p.eliminatedUserId) {
        setEliminated(prev =>
          prev.includes(p.eliminatedUserId!)
            ? prev
            : [...prev, p.eliminatedUserId!],
        );
      }
    });
    return offTimeout;
  }, [on]);

  // A failed first fetch used to be permanent: nothing retried while the
  // socket stayed healthy, leaving the player on the spinner all match.
  useMatchSyncRetry(syncState, loaded && discardTop !== null);

  const prevStatusRef = useRef(status);
  useEffect(() => {
    const was = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status !== 'connected' || was !== 'disconnected') {
      return;
    }
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

  const result: 'win' | 'lose' | null = winnerUserId
    ? winnerUserId === myUserId
      ? 'win'
      : 'lose'
    : null;

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

  const playProps: ChromaPlayProps = {
    seats,
    myHand,
    myTurn:
      !result &&
      stage === 'play' &&
      turnUserId !== null &&
      turnUserId === myUserId,
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
    resultReason: result ? endReason : null,
    winnerName: winnerUserId ? nameOf(winnerUserId) : null,
    onPlay,
    onDraw,
    onPass,
    onPickColor,
  };

  return {
    phase: loaded && discardTop !== null ? 'play' : 'waiting',
    waitingError,
    forfeit,
    playProps,
  };
}
