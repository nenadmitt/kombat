import {
  chooseBotMove,
  LUDO_EVENTS,
  type LudoColor,
  type LudoEndedPayload,
  type LudoMovedPayload,
  type LudoRoomState,
  type LudoRolledPayload,
  type LudoTokens,
} from '@gaming-platform/core';

import { pauseFor, sleep } from '../bot/pacing';
import { gameChannel, once, type DriverContext, type DriverResult } from './driver';
import { joinChannel } from '../net/socket';

type Local = {
  tokens: LudoTokens;
  myColor: LudoColor | null;
  turnUserId: string | null;
  stage: LudoRoomState['stage'];
  die: number | null;
  movableTokens: number[];
  turnDeadline: number | null;
  winnerUserId: string | null;
  over: boolean;
};

export async function playLudo(ctx: DriverContext): Promise<DriverResult> {
  const { api, socket, roomId, myUserId, config, log, signal } = ctx;

  // The first turn clock is already running when the match starts, so enter
  // and read the snapshot immediately rather than waiting for an event.
  joinChannel(socket, gameChannel(roomId));
  socket.emit(LUDO_EVENTS.enter, { roomId });

  const state = await api.getLudoRoomState(roomId);
  const local: Local = {
    tokens: state.tokens,
    myColor: state.players.find(p => p.userId === myUserId)?.color ?? null,
    turnUserId: state.turnUserId,
    stage: state.stage,
    die: state.die,
    movableTokens: state.movableTokens,
    turnDeadline: state.turnDeadline,
    winnerUserId: state.winnerUserId,
    over: state.winnerUserId !== null,
  };

  const applyState = (snapshot: LudoRoomState): void => {
    local.tokens = snapshot.tokens;
    local.myColor =
      snapshot.players.find(p => p.userId === myUserId)?.color ?? local.myColor;
    local.turnUserId = snapshot.turnUserId;
    local.stage = snapshot.stage;
    local.die = snapshot.die;
    local.movableTokens = snapshot.movableTokens;
    local.turnDeadline = snapshot.turnDeadline;
    local.winnerUserId = snapshot.winnerUserId;
    local.over = snapshot.winnerUserId !== null;
  };

  socket.on(LUDO_EVENTS.rolled, (payload: LudoRolledPayload) => {
    local.stage = payload.stage;
    local.turnUserId = payload.nextTurnUserId;
    local.turnDeadline = payload.turnDeadline;
    local.die = payload.stage === 'move' ? payload.die : null;
    local.movableTokens = payload.byUserId === myUserId ? payload.movableTokens : [];
  });

  socket.on(LUDO_EVENTS.moved, (payload: LudoMovedPayload) => {
    // Authoritative map: replace it, never replay the move locally.
    local.tokens = payload.tokens;
    local.stage = payload.stage;
    local.turnUserId = payload.nextTurnUserId;
    local.turnDeadline = payload.turnDeadline;
    local.die = null;
    local.movableTokens = [];
    local.winnerUserId = payload.winnerUserId;
    if (payload.winnerUserId !== null) local.over = true;
  });

  socket.on(LUDO_EVENTS.ended, (payload: LudoEndedPayload) => {
    local.winnerUserId = payload.winnerUserId;
    local.over = true;
  });

  socket.on(LUDO_EVENTS.eliminated, (payload: { userId?: string }) => {
    if (payload?.userId === myUserId) local.over = true;
  });

  let resyncWanted = false;
  socket.on(LUDO_EVENTS.error, (payload: unknown) => {
    log.debug(`ludo error, resyncing: ${JSON.stringify(payload)}`);
    resyncWanted = true;
  });

  while (!local.over && !signal.aborted) {
    if (resyncWanted) {
      resyncWanted = false;
      applyState(await api.getLudoRoomState(roomId));
      continue;
    }

    if (local.turnUserId !== myUserId) {
      await Promise.race([
        once(socket, LUDO_EVENTS.rolled, signal, 5_000),
        once(socket, LUDO_EVENTS.moved, signal, 5_000),
        once(socket, LUDO_EVENTS.turnTimeout, signal, 5_000),
      ]);
      continue;
    }

    if (local.stage === 'roll') {
      await sleep(pauseFor(config.pacing.ludoRollMs, local.turnDeadline), signal);
      if (signal.aborted || local.over) break;
      if (local.turnUserId !== myUserId || local.stage !== 'roll') continue;
      socket.emit(LUDO_EVENTS.roll, { roomId });
      await Promise.race([
        once(socket, LUDO_EVENTS.rolled, signal, 8_000),
        once(socket, LUDO_EVENTS.error, signal, 8_000),
      ]);
      continue;
    }

    // stage === 'move': a die is pending and it is ours to spend.
    await sleep(pauseFor(config.pacing.ludoMoveMs, local.turnDeadline), signal);
    if (signal.aborted || local.over) break;
    if (local.turnUserId !== myUserId || local.stage !== 'move') continue;

    const die = local.die;
    if (die === null || local.myColor === null) {
      applyState(await api.getLudoRoomState(roomId));
      continue;
    }
    const chosen = chooseBotMove(local.tokens, local.myColor, die);
    const tokenIndex =
      chosen !== null && local.movableTokens.includes(chosen)
        ? chosen
        : (local.movableTokens[0] ?? null);
    if (tokenIndex === null) {
      applyState(await api.getLudoRoomState(roomId));
      continue;
    }
    socket.emit(LUDO_EVENTS.move, { roomId, tokenIndex });
    await Promise.race([
      once(socket, LUDO_EVENTS.moved, signal, 8_000),
      once(socket, LUDO_EVENTS.error, signal, 8_000),
    ]);
  }

  return { winnerUserId: local.winnerUserId };
}
