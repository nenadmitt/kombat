import {
  clampTankX,
  fireShot,
  SALVO_EVENTS,
  SALVO_MOVE_RANGE,
  SALVO_FIELD_HEIGHT,
  SALVO_FIELD_WIDTH,
  SALVO_MAX_ANGLE,
  SALVO_MAX_POWER,
  SALVO_MIN_ANGLE,
  SALVO_MIN_POWER,
  type SalvoEndedPayload,
  type SalvoRoomState,
  type SalvoShotPayload,
  type SalvoTank,
  type SalvoTerrain,
  type SalvoTurnTimeoutPayload,
} from '@gaming-platform/core';

import { jitter, pauseFor, sleep } from '../bot/pacing';
import { gameChannel, once, type DriverContext, type DriverResult } from './driver';
import { joinChannel } from '../net/socket';

/** How far off the true solution the bot deliberately aims, in degrees/power. */
const AIM_WOBBLE = { angle: 4, power: 6 };

/** Chance an unhurt bot repositions anyway - so movement is not itself a tell. */
const IDLE_MOVE_CHANCE = 0.2;

type Local = {
  terrain: SalvoTerrain;
  me: SalvoTank | null;
  them: SalvoTank | null;
  wind: number;
  /** Set when the opponent's last shot took HP off us. */
  hitLastRound: boolean;
  turnUserId: string | null;
  turnDeadline: number | null;
  winnerUserId: string | null;
  over: boolean;
};

/**
 * Where to drive after taking a hit. The opponent has our range dialled in,
 * so the whole point is to be somewhere else: the full move budget, away
 * from where the shell landed when that is legal, otherwise the other way.
 * A tank that never moves is the easiest tell there is.
 */
export function chooseMove(
  me: SalvoTank,
  them: SalvoTank,
  lastImpactX: number | null,
): number | null {
  const awayFromImpact =
    lastImpactX === null ? (Math.random() < 0.5 ? 1 : -1) : me.x >= lastImpactX ? 1 : -1;
  const wanted = SALVO_MOVE_RANGE * awayFromImpact;
  let target = clampTankX(me.x, wanted, me.side, them.x);
  // Pinned against an edge or the separation line: go the other way instead.
  if (Math.abs(target - me.x) < SALVO_MOVE_RANGE / 2) {
    target = clampTankX(me.x, -wanted, me.side, them.x);
  }
  return Math.abs(target - me.x) < 4 ? null : Math.round(target);
}

/**
 * Pick an aim by simulating candidates with the same fireShot the server
 * uses, and keeping whichever lands closest to the target. A coarse grid is
 * enough - ~150 flights, well under a millisecond each - and the result is
 * then smudged so the bot bracket-shoots like a person instead of landing
 * every shell on the hull.
 */
export function chooseAim(
  terrain: SalvoTerrain,
  me: SalvoTank,
  them: SalvoTank,
  wind: number,
): { angle: number; power: number } {
  let best = { angle: 45, power: 60, miss: Number.POSITIVE_INFINITY };
  for (let angle = SALVO_MIN_ANGLE + 5; angle <= SALVO_MAX_ANGLE - 5; angle += 5) {
    for (let power = SALVO_MIN_POWER + 20; power <= SALVO_MAX_POWER; power += 5) {
      const shot = fireShot(terrain, { ...me, angle, power }, them, wind);
      if (shot.kind === 'out-of-bounds') continue;
      // Self-damage is a real cost: a lob that comes back on us is not a hit.
      const miss = Math.abs(shot.impact.x - them.x) + shot.selfDamage * 3;
      if (miss < best.miss) best = { angle, power, miss };
    }
  }
  return {
    angle: Math.round(best.angle + (Math.random() * 2 - 1) * AIM_WOBBLE.angle),
    power: Math.round(best.power + (Math.random() * 2 - 1) * AIM_WOBBLE.power),
  };
}

function terrainFrom(heights: number[]): SalvoTerrain {
  return { width: SALVO_FIELD_WIDTH, height: SALVO_FIELD_HEIGHT, heights };
}

export async function playSalvo(ctx: DriverContext): Promise<DriverResult> {
  const { api, socket, roomId, myUserId, config, log, signal, onReconnect } =
    ctx;

  joinChannel(socket, gameChannel(roomId));
  socket.emit(SALVO_EVENTS.enter, { roomId });

  const state = await api.getSalvoRoomState(roomId);
  const local: Local = {
    terrain: terrainFrom(state.terrain),
    me: null,
    them: null,
    wind: state.wind,
    hitLastRound: false,
    turnUserId: state.turnUserId,
    turnDeadline: state.turnDeadline,
    winnerUserId: state.winnerUserId,
    over: state.phase === 'over',
  };

  const seatTanks = (snapshot: SalvoRoomState): void => {
    for (const seat of snapshot.seats) {
      const tank: SalvoTank = {
        side: seat.side,
        x: seat.x,
        hp: seat.hp,
        angle: seat.angle,
        power: seat.power,
      };
      if (seat.userId === myUserId) local.me = tank;
      else local.them = tank;
    }
  };
  seatTanks(state);

  const applyState = (snapshot: SalvoRoomState): void => {
    local.terrain = terrainFrom(snapshot.terrain);
    seatTanks(snapshot);
    local.wind = snapshot.wind;
    local.turnUserId = snapshot.turnUserId;
    local.turnDeadline = snapshot.turnDeadline;
    local.winnerUserId = snapshot.winnerUserId;
    local.over = snapshot.phase === 'over';
  };

  let lastImpactX: number | null = null;
  socket.on(SALVO_EVENTS.shot, (payload: SalvoShotPayload) => {
    if (payload.byUserId !== myUserId) {
      lastImpactX = payload.impact.x;
      // Only their shot can hurt us; a self-hit is not something to run from.
      local.hitLastRound = payload.damage > 0;
    }
    if (payload.crater) {
      // The server sends the crater point, not the new heightmap; a resync
      // is the honest way to see the ground as it now is.
      resyncWanted = true;
    }
    for (const [userId, hp] of Object.entries(payload.hp)) {
      const tank = userId === myUserId ? local.me : local.them;
      if (tank) tank.hp = hp;
    }
    local.wind = payload.wind;
    local.turnUserId = payload.nextTurnUserId;
    local.turnDeadline = payload.turnDeadline;
    local.winnerUserId = payload.winnerUserId;
    if (payload.winnerUserId !== null) local.over = true;
  });

  socket.on(SALVO_EVENTS.moved, (payload: { byUserId: string; x: number }) => {
    const tank = payload.byUserId === myUserId ? local.me : local.them;
    if (tank) tank.x = payload.x;
  });

  socket.on(SALVO_EVENTS.turnTimeout, (payload: SalvoTurnTimeoutPayload) => {
    local.turnUserId = payload.nextTurnUserId;
    local.turnDeadline = payload.turnDeadline;
    local.winnerUserId = payload.winnerUserId;
    if (payload.winnerUserId !== null) local.over = true;
  });

  socket.on(SALVO_EVENTS.ended, (payload: SalvoEndedPayload) => {
    local.winnerUserId = payload.winnerUserId;
    local.over = true;
  });

  let resyncWanted = false;
  socket.on(SALVO_EVENTS.error, (payload: unknown) => {
    log.debug(`salvo error, resyncing: ${JSON.stringify(payload)}`);
    resyncWanted = true;
  });
  onReconnect(() => {
    joinChannel(socket, gameChannel(roomId));
    socket.emit(SALVO_EVENTS.enter, { roomId });
    resyncWanted = true;
  });

  while (!local.over && !signal.aborted) {
    if (resyncWanted) {
      resyncWanted = false;
      applyState(await api.getSalvoRoomState(roomId));
      continue;
    }

    if (local.turnUserId !== myUserId) {
      await Promise.race([
        once(socket, SALVO_EVENTS.shot, signal, 5_000),
        once(socket, SALVO_EVENTS.turnTimeout, signal, 5_000),
      ]);
      continue;
    }

    await sleep(pauseFor(config.pacing.salvoShotMs, local.turnDeadline), signal);
    if (signal.aborted || local.over) break;
    if (local.turnUserId !== myUserId) continue;

    if (!local.me || !local.them) {
      applyState(await api.getSalvoRoomState(roomId));
      continue;
    }
    // Took a hit: relocate before shooting, so the opponent has to find us
    // again. Sometimes move unhurt too, so moving is not itself a signal.
    const shouldMove =
      local.hitLastRound || Math.random() < IDLE_MOVE_CHANCE;
    if (shouldMove) {
      const toX = chooseMove(local.me, local.them, lastImpactX);
      if (toX !== null) {
        socket.emit(SALVO_EVENTS.move, { roomId, toX });
        // The moved listener updates local.me.x, so the aim below is taken
        // from where we actually ended up, not where we asked to go.
        await Promise.race([
          once(socket, SALVO_EVENTS.moved, signal, 4_000),
          once(socket, SALVO_EVENTS.error, signal, 4_000),
        ]);
        await sleep(jitter({ min: 600, max: 1_400 }), signal);
        if (signal.aborted || local.over) break;
      }
    }
    local.hitLastRound = false;

    const aim = chooseAim(local.terrain, local.me, local.them, local.wind);
    socket.emit(SALVO_EVENTS.fire, { roomId, ...aim });
    await sleep(jitter({ min: 200, max: 600 }), signal);
    await Promise.race([
      once(socket, SALVO_EVENTS.shot, signal, 8_000),
      once(socket, SALVO_EVENTS.error, signal, 8_000),
    ]);
  }

  return { winnerUserId: local.winnerUserId };
}
