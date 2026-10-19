import {
  randomMove,
  RPS_EVENTS,
  type RpsEndedPayload,
  type RpsRevealPayload,
  type RpsRoomState,
} from '@gaming-platform/core';

import { pauseFor, sleep } from '../bot/pacing';
import { gameChannel, once, type DriverContext, type DriverResult } from './driver';
import { joinChannel } from '../net/socket';

type Local = {
  round: number;
  locked: boolean;
  deadline: number | null;
  winnerUserId: string | null;
  over: boolean;
};

// Uniformly random is unexploitable and keeps the bot exactly as beatable as a coin flip.
export async function playRps(ctx: DriverContext): Promise<DriverResult> {
  const { api, socket, roomId, config, log, signal, onReconnect } = ctx;

  joinChannel(socket, gameChannel(roomId));
  socket.emit(RPS_EVENTS.enter, { roomId });

  const state = await api.getRpsRoomState(roomId);
  const local: Local = {
    round: state.round,
    locked: state.myMove !== null,
    deadline: state.roundDeadline,
    winnerUserId: state.winnerUserId,
    over: state.phase === 'over',
  };

  const applyState = (snapshot: RpsRoomState): void => {
    local.round = snapshot.round;
    local.locked = snapshot.myMove !== null;
    local.deadline = snapshot.roundDeadline;
    local.winnerUserId = snapshot.winnerUserId;
    local.over = snapshot.phase === 'over';
  };

  socket.on(RPS_EVENTS.reveal, (payload: RpsRevealPayload) => {
    local.round = payload.nextRound;
    local.locked = false;
    local.deadline = payload.nextDeadline;
    local.winnerUserId = payload.winnerUserId;
    if (payload.winnerUserId !== null) local.over = true;
  });

  socket.on(RPS_EVENTS.ended, (payload: RpsEndedPayload) => {
    local.winnerUserId = payload.winnerUserId;
    local.over = true;
  });

  let resyncWanted = false;
  socket.on(RPS_EVENTS.error, (payload: unknown) => {
    log.debug(`rps error, resyncing: ${JSON.stringify(payload)}`);
    resyncWanted = true;
  });
  onReconnect(() => {
    joinChannel(socket, gameChannel(roomId));
    socket.emit(RPS_EVENTS.enter, { roomId });
    resyncWanted = true;
  });

  while (!local.over && !signal.aborted) {
    if (resyncWanted) {
      resyncWanted = false;
      applyState(await api.getRpsRoomState(roomId));
      continue;
    }

    if (local.locked) {
      await Promise.race([
        once(socket, RPS_EVENTS.reveal, signal, 5_000),
        once(socket, RPS_EVENTS.ended, signal, 5_000),
      ]);
      continue;
    }

    await sleep(pauseFor(config.pacing.rpsLockMs, local.deadline), signal);
    if (signal.aborted || local.over || local.locked) continue;

    socket.emit(RPS_EVENTS.lock, { roomId, move: randomMove() });
    local.locked = true;
    await Promise.race([
      once(socket, RPS_EVENTS.locked, signal, 8_000),
      once(socket, RPS_EVENTS.reveal, signal, 8_000),
      once(socket, RPS_EVENTS.error, signal, 8_000),
    ]);
  }

  return { winnerUserId: local.winnerUserId };
}
