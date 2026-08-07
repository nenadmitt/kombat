import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SALVO_EVENTS,
  SALVO_FIELD_HEIGHT,
  SALVO_MOVE_RANGE,
  SALVO_START_ANGLE,
  SALVO_START_POWER,
  SalvoSide,
  carveCrater,
  clampAngle,
  clampPower,
  type SalvoEndReason,
  type SalvoEndedPayload,
  type SalvoMovedPayload,
  type SalvoPlayerStats,
  type SalvoPresencePayload,
  type SalvoRoomState,
  type SalvoSeatState,
  type SalvoShotPayload,
  type SalvoTerrain,
  type SalvoTurnTimeoutPayload,
} from '@gaming-platform/core';

import { useSessionStore } from '../../store/session.store';
import { useUsernames } from '../../store/usernames';
import { useWebsocketStore } from '../../store/websocket.store';
import type {
  SalvoDamageEvent,
  SalvoEngine,
  SalvoFlight,
  SalvoPlayProps,
  SalvoSeatView,
  SalvoTrail,
} from './salvo-engine';

/** One shell step per frame; the server's path is ~60 points, so ~1s of flight. */
const SHELL_FRAME_MS = 16;
/** A destroyed hull burns this long before the result screen takes over. */
const DESTRUCTION_MS = 3500;
/** A confirmed drive rolls the hull over this long, matching the local game. */
const DRIVE_MS = 1500;
const DRIVE_FRAME_MS = 33;

const roundOf = (shotNumber: number) => Math.ceil(shotNumber / 2);

/** Salvo's snapshot is a push, so a retry means re-entering. */
const SYNC_RETRY_MS = 3000;

/**
 * Multiplayer engine: the server owns the terrain, both tanks, the wind and
 * every trajectory. This client sends intent only - a column to drive to, an
 * aim to fire with - and animates the outcomes it is pushed. The one piece of
 * local state is my own undisclosed dial, which is not sent until I fire.
 */
export function useMultiplayerSalvo(roomId: string): SalvoEngine {
  const joinChannel = useWebsocketStore(s => s.joinChannel);
  const leaveChannel = useWebsocketStore(s => s.leaveChannel);
  const on = useWebsocketStore(s => s.on);
  const emit = useWebsocketStore(s => s.emit);
  const status = useWebsocketStore(s => s.status);
  const myUserId = useSessionStore(s => s.user?.id) ?? null;

  const [terrain, setTerrain] = useState<SalvoTerrain | null>(null);
  const [seats, setSeats] = useState<SalvoSeatState[]>([]);
  const [turnUserId, setTurnUserId] = useState<string | null>(null);
  const [movesLeft, setMovesLeft] = useState(0);
  const [wind, setWind] = useState(0);
  const [shotNumber, setShotNumber] = useState(1);
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null);
  const [stats, setStats] = useState<Record<string, SalvoPlayerStats>>({});
  const [winnerUserId, setWinnerUserId] = useState<string | null>(null);
  const [endReason, setEndReason] = useState<SalvoEndReason | null>(null);
  const [resultRevealed, setResultRevealed] = useState(false);
  const [destroyedUserId, setDestroyedUserId] = useState<string | null>(null);

  const [waitingError, setWaitingError] = useState<string | null>(null);
  const [damage, setDamage] = useState<SalvoDamageEvent | null>(null);
  const [flight, setFlight] = useState<SalvoFlight | null>(null);
  const [trail, setTrail] = useState<SalvoTrail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [driving, setDriving] = useState(false);

  /** My own aim, deliberately local until the moment I fire. */
  const [myAngle, setMyAngle] = useState(SALVO_START_ANGLE);
  const [myPower, setMyPower] = useState(SALVO_START_POWER);

  const myUserIdRef = useRef(myUserId);
  myUserIdRef.current = myUserId;

  const usernames = useUsernames(seats.map(s => s.userId));
  const usernamesRef = useRef(usernames);
  usernamesRef.current = usernames;

  const nameOf = useCallback((userId: string): string => {
    if (userId === myUserIdRef.current) {
      return 'You';
    }
    return usernamesRef.current[userId] ?? 'Player';
  }, []);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const shellTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const driveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const shotId = useRef(0);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (shellTimer.current) {
      clearInterval(shellTimer.current);
      shellTimer.current = null;
    }
    if (driveTimer.current) {
      clearInterval(driveTimer.current);
      driveTimer.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const applyState = useCallback((s: SalvoRoomState) => {
    setWaitingError(null);
    setTerrain({
      width: s.terrain.length,
      height: SALVO_FIELD_HEIGHT,
      heights: [...s.terrain],
    });
    setSeats(s.seats);
    setTurnUserId(s.turnUserId);
    setMovesLeft(s.movesLeft);
    setWind(s.wind);
    setShotNumber(s.shotNumber);
    setTurnDeadline(s.turnDeadline);
    setStats(s.stats);
    setWinnerUserId(s.winnerUserId);
    setEndReason(s.endReason);
    // A snapshot is authoritative: if the match is already over there is no
    // wreck left to watch, so the result shows immediately.
    setResultRevealed(s.winnerUserId !== null);
    setDestroyedUserId(null);
    setFlight(null);
    setTrail(null);
  }, []);

  /** Roll a hull from where it stands to the column the server confirmed. */
  const animateDrive = useCallback((userId: string, toX: number) => {
    if (driveTimer.current) {
      clearInterval(driveTimer.current);
      driveTimer.current = null;
    }
    const from = seatsRef.current.find(s => s.userId === userId)?.x ?? toX;
    const frames = Math.max(1, Math.round(DRIVE_MS / DRIVE_FRAME_MS));
    let done = 0;
    setDriving(true);
    driveTimer.current = setInterval(() => {
      done += 1;
      const t = done / frames;
      setSeats(prev =>
        prev.map(s =>
          s.userId === userId ? { ...s, x: from + (toX - from) * t } : s,
        ),
      );
      if (done >= frames) {
        if (driveTimer.current) {
          clearInterval(driveTimer.current);
          driveTimer.current = null;
        }
        setSeats(prev =>
          prev.map(s => (s.userId === userId ? { ...s, x: toX } : s)),
        );
        setDriving(false);
      }
    }, DRIVE_FRAME_MS);
  }, []);

  /** Apply the shot's consequences once the shell has landed on screen. */
  const settle = useCallback((payload: SalvoShotPayload, side: SalvoSide) => {
    setFlight(null);
    setTrail({ shooter: side, path: payload.path, impact: payload.impact, id: shotId.current });
    // The crater is arithmetic, not simulation, so applying the server's
    // impact point locally always yields the server's heightmap.
    if (payload.crater) {
      setTerrain(prev => {
        if (!prev) {
          return prev;
        }
        const next = { ...prev, heights: [...prev.heights] };
        carveCrater(next, payload.crater!);
        return next;
      });
    }
    // One popup per hull that actually lost HP, from the server's numbers.
    const shooterSide = side;
    const targetSide =
      side === SalvoSide.Left ? SalvoSide.Right : SalvoSide.Left;
    const hits = [
      ...(payload.damage > 0
        ? [{ side: targetSide, amount: payload.damage, kind: payload.damageKind }]
        : []),
      ...(payload.selfDamage > 0
        ? [{ side: shooterSide, amount: payload.selfDamage, kind: 'splash' as const }]
        : []),
    ];
    setDamage(hits.length ? { id: shotId.current, hits } : null);
    setSeats(prev =>
      prev.map(s => ({ ...s, hp: payload.hp[s.userId] ?? s.hp })),
    );
    setStats(payload.stats);
    setWind(payload.wind);
    setShotNumber(payload.shotNumber);
    setTurnUserId(payload.nextTurnUserId);
    setTurnDeadline(payload.turnDeadline);
    setMovesLeft(SALVO_MOVE_RANGE);
    setNotice(describeShot(payload, nameOf(payload.byUserId)));

    if (payload.winnerUserId) {
      setWinnerUserId(payload.winnerUserId);
      setEndReason('destroyed');
      const loser = Object.keys(payload.hp).find(id => (payload.hp[id] ?? 0) <= 0);
      setDestroyedUserId(loser ?? null);
      timers.current.push(
        setTimeout(() => setResultRevealed(true), DESTRUCTION_MS),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Fly the server's own path, then settle the outcome it already decided. */
  const playShot = useCallback((payload: SalvoShotPayload) => {
    shotId.current += 1;
    const id = shotId.current;
    const shooter = payload.byUserId;

    setNotice(null);
    setTrail(null);
    setDamage(null);
    setSeats(prev =>
      prev.map(s =>
        s.userId === shooter
          ? { ...s, angle: payload.angle, power: payload.power }
          : s,
      ),
    );

    const side =
      seatsRef.current.find(s => s.userId === shooter)?.side ?? SalvoSide.Left;
    setFlight({
      shooter: side,
      path: payload.path,
      shell: payload.path[0] ?? payload.impact,
      id,
    });

    let i = 0;
    if (shellTimer.current) {
      clearInterval(shellTimer.current);
    }
    shellTimer.current = setInterval(() => {
      i += 1;
      const next = payload.path[i];
      if (next) {
        setFlight(prev => (prev ? { ...prev, shell: next } : prev));
        return;
      }
      if (shellTimer.current) {
        clearInterval(shellTimer.current);
        shellTimer.current = null;
      }
      settle(payload, side);
    }, SHELL_FRAME_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a ref of seats so socket handlers resolve sides without re-subscribing.
  const seatsRef = useRef(seats);
  seatsRef.current = seats;

  useEffect(() => {
    const channel = `game:${roomId}`;
    joinChannel(channel);
    emit(SALVO_EVENTS.enter, { roomId });

    const offState = on(SALVO_EVENTS.state, payload =>
      applyState(payload as SalvoRoomState),
    );

    const offMoved = on(SALVO_EVENTS.moved, raw => {
      const payload = raw as SalvoMovedPayload;
      if (payload.byUserId === myUserIdRef.current) {
        setMovesLeft(payload.movesLeft);
      }
      animateDrive(payload.byUserId, payload.x);
    });

    const offShot = on(SALVO_EVENTS.shot, payload =>
      playShot(payload as SalvoShotPayload),
    );

    const offTimeout = on(SALVO_EVENTS.turnTimeout, raw => {
      const payload = raw as SalvoTurnTimeoutPayload;
        setTurnUserId(payload.nextTurnUserId);
        setTurnDeadline(payload.turnDeadline);
        setMovesLeft(SALVO_MOVE_RANGE);
        setNotice(`${nameOf(payload.timedOutUserId)} ran out of time`);
      if (payload.winnerUserId) {
        setWinnerUserId(payload.winnerUserId);
        setEndReason('timeout');
        setResultRevealed(true);
      }
    });

    const offPresence = on(SALVO_EVENTS.presence, raw => {
      const payload = raw as SalvoPresencePayload;
      setSeats(prev =>
        prev.map(s =>
          s.userId === payload.userId ? { ...s, online: payload.online } : s,
        ),
      );
    });

    // The gateway reports enter/action failures on salvo:error. Surfacing
    // them is what turns "stuck on a spinner" into a readable bug report.
    const offError = on(SALVO_EVENTS.error, raw => {
      const message =
        (raw as { message?: string }).message ?? 'Something went wrong.';
      console.warn('[salvo] server error:', message);
      setWaitingError(message);
    });

    const offEnded = on(SALVO_EVENTS.ended, raw => {
      const payload = raw as SalvoEndedPayload;
      setWinnerUserId(payload.winnerUserId);
      setEndReason(payload.reason);
      setResultRevealed(true);
    });

    return () => {
      offState();
      offError();
      offMoved();
      offShot();
      offTimeout();
      offPresence();
      offEnded();
      leaveChannel(channel);
    };
    // `status` is a dependency because a forced reconnect replaces the socket
    // instance: handlers bound to the old one are gone, and without re-running
    // this the match goes silent while still looking connected.
  }, [
    roomId,
    joinChannel,
    leaveChannel,
    on,
    emit,
    applyState,
    animateDrive,
    playShot,
    nameOf,
    status,
  ]);

  // A reconnect re-enters, which re-pushes the authoritative snapshot.
  useEffect(() => {
    if (status === 'connected') {
      emit(SALVO_EVENTS.enter, { roomId });
    }
  }, [status, roomId, emit]);

  // Salvo's snapshot arrives as a push rather than a fetch, so "retry" means
  // re-entering. The server rejects an enter until the room is InProgress,
  // and that can lag the start event, so keep asking until terrain lands.
  useEffect(() => {
    if (terrain !== null) return;
    const timer = setInterval(
      () => emit(SALVO_EVENTS.enter, { roomId }),
      SYNC_RETRY_MS,
    );
    return () => clearInterval(timer);
  }, [terrain, emit, roomId]);

  const onAim = useCallback((aim: { angle?: number; power?: number }) => {
    if (aim.angle !== undefined) {
      setMyAngle(clampAngle(aim.angle));
    }
    if (aim.power !== undefined) {
      setMyPower(clampPower(aim.power));
    }
  }, []);

  const onMove = useCallback(
    (direction: -1 | 1) => {
      const me = seatsRef.current.find(s => s.userId === myUserIdRef.current);
      if (!me) {
        return;
      }
      // Ask for the whole remaining allowance; the server clamps and bills it.
      emit(SALVO_EVENTS.move, { roomId, toX: me.x + SALVO_MOVE_RANGE * direction });
    },
    [emit, roomId],
  );

  const onFire = useCallback(() => {
    emit(SALVO_EVENTS.fire, { roomId, angle: myAngle, power: myPower });
  }, [emit, roomId, myAngle, myPower]);

  const forfeit = useCallback(() => {
    emit(SALVO_EVENTS.forfeit, { roomId });
  }, [emit, roomId]);

  // --- derived play props ------------------------------------------------------

  const me = seats.find(s => s.userId === myUserId) ?? null;
  const mySide = me?.side ?? SalvoSide.Left;

  const seatViews: SalvoSeatView[] = seats.map(s => ({
    side: s.side,
    name: nameOf(s.userId),
    initial: nameOf(s.userId).charAt(0).toUpperCase(),
    isMe: s.userId === myUserId,
    hp: s.hp,
    x: s.x,
    // My own barrel tracks my live dial; theirs shows what they last fired.
    angle: s.userId === myUserId ? myAngle : s.angle,
    power: s.userId === myUserId ? myPower : s.power,
  }));

  const over = winnerUserId !== null;
  const result: 'win' | 'lose' | null = !resultRevealed
    ? null
    : winnerUserId === myUserId
      ? 'win'
      : 'lose';
  const myTurn =
    !over && turnUserId === myUserId && flight === null && terrain !== null;
  const armed = myTurn && !driving;

  const statsBySide: Record<SalvoSide, SalvoPlayerStats> = {
    [SalvoSide.Left]: emptyStats(),
    [SalvoSide.Right]: emptyStats(),
  };
  for (const seat of seats) {
    statsBySide[seat.side] = stats[seat.userId] ?? emptyStats();
  }

  const destroyedSide =
    destroyedUserId === null
      ? null
      : (seats.find(s => s.userId === destroyedUserId)?.side ?? null);

  const playProps: SalvoPlayProps = {
    terrain: terrain ?? EMPTY_TERRAIN,
    seats: seatViews,
    me: mySide,
    myTurn,
    armed,
    movesLeft: myTurn ? movesLeft : 0,
    wind,
    shotNumber,
    round: roundOf(shotNumber),
    flight,
    trail,
    damage,
    aiming: armed ? mySide : null,
    destroyed: destroyedSide,
    notice,
    turnDeadline: over ? null : turnDeadline,
    result,
    resultReason: result ? endReason : null,
    stats: statsBySide,
    onAim,
    onMove,
    onFire,
    // The server's sweeper enforces the clock; the client never auto-fires,
    // which would race it.
    onTimerExpire: () => {},
  };

  return {
    phase: terrain === null || seats.length < 2 ? 'waiting' : 'play',
    waitingError,
    forfeit,
    playProps,
  };
}

const emptyStats = (): SalvoPlayerStats => ({
  shots: 0,
  hits: 0,
  bestHit: 0,
  damageByRound: [],
});

/** Placeholder while the first snapshot is still in flight. */
const EMPTY_TERRAIN: SalvoTerrain = {
  width: 1,
  height: SALVO_FIELD_HEIGHT,
  heights: [0],
};

/** Read a resolved shot as the one-line banner, from the shooter's side. */
function describeShot(payload: SalvoShotPayload, who: string): string {
  if (payload.selfDamage > 0) {
    return `${who} caught the blast - ${payload.selfDamage} self damage`;
  }
  if (payload.kind === 'out-of-bounds') {
    return `${who} sent it off the map`;
  }
  if (payload.damage === 0) {
    return `${who} missed`;
  }
  if (payload.kind === 'tank') {
    return `Direct hit - ${payload.damage} damage`;
  }
  return `${who} clipped it - ${payload.damage} damage`;
}
