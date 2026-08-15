import {
  BATTLESHIP_EVENTS,
  chooseAim,
  randomFleet,
  randomMines,
  type BattleshipRoomState,
  type EndedPayload,
  type FleetPlacements,
  type RevealedShip,
  type Shot,
  type ShotPayload,
  type StartPayload,
  type TurnTimeoutPayload,
} from '@gaming-platform/core';

import { pauseFor, sleep } from '../bot/pacing';
import { gameChannel, once, type DriverContext, type DriverResult } from './driver';
import { joinChannel } from '../net/socket';

/**
 * chooseAim reads the *defender's* fleet to know which hits belong to a ship
 * that is already sunk. A networked player only ever learns the ships that
 * have sunk, so feeding it those alone leaves every hit on a still-floating
 * ship looking "active" - which is exactly the trail the hunt should follow.
 */
function syntheticFleet(revealed: RevealedShip[]): FleetPlacements {
  return Object.fromEntries(revealed.map(ship => [ship.id, ship.placement]));
}

type Local = {
  myShots: Shot[];
  revealed: RevealedShip[];
  turnUserId: string | null;
  turnDeadline: number | null;
  winnerUserId: string | null;
  over: boolean;
};

export async function playBattleship(
  ctx: DriverContext,
): Promise<DriverResult> {
  const { api, socket, roomId, myUserId, config, log, signal, onReconnect } =
    ctx;

  joinChannel(socket, gameChannel(roomId));
  socket.emit(BATTLESHIP_EVENTS.enter, { roomId });

  const state = await api.getBattleshipRoomState(roomId);
  const local: Local = {
    myShots: state.myShots,
    revealed: state.revealedOpponentShips,
    turnUserId: state.turnUserId,
    turnDeadline: state.turnDeadline,
    winnerUserId: state.winnerUserId,
    over: state.winnerUserId !== null,
  };

  const applyState = (snapshot: BattleshipRoomState): void => {
    local.myShots = snapshot.myShots;
    local.revealed = snapshot.revealedOpponentShips;
    local.turnUserId = snapshot.turnUserId;
    local.turnDeadline = snapshot.turnDeadline;
    local.winnerUserId = snapshot.winnerUserId;
    local.over = snapshot.winnerUserId !== null;
  };

  socket.on(BATTLESHIP_EVENTS.start, (payload: StartPayload) => {
    local.turnUserId = payload.firstTurnUserId;
    local.turnDeadline = payload.turnDeadline;
  });

  socket.on(BATTLESHIP_EVENTS.shot, (payload: ShotPayload) => {
    if (payload.byUserId === myUserId) {
      local.myShots = [...local.myShots, ...payload.cells];
      local.revealed = [...local.revealed, ...payload.sunkShips];
    }
    local.turnUserId = payload.nextTurnUserId;
    local.turnDeadline = payload.turnDeadline;
    local.winnerUserId = payload.winnerUserId;
    if (payload.winnerUserId !== null) local.over = true;
  });

  socket.on(BATTLESHIP_EVENTS.turnTimeout, (payload: TurnTimeoutPayload) => {
    local.turnUserId = payload.nextTurnUserId;
    local.turnDeadline = payload.turnDeadline;
    local.winnerUserId = payload.winnerUserId;
    if (payload.winnerUserId !== null) local.over = true;
  });

  socket.on(BATTLESHIP_EVENTS.ended, (payload: EndedPayload) => {
    local.winnerUserId = payload.winnerUserId;
    local.over = true;
  });

  // The gateway answers a refused action here and nowhere else (no acks), so
  // an error means our view is stale rather than that the action was illegal.
  let resyncWanted = false;
  onReconnect(() => {
    joinChannel(socket, gameChannel(roomId));
    socket.emit(BATTLESHIP_EVENTS.enter, { roomId });
    resyncWanted = true;
  });
  socket.on(BATTLESHIP_EVENTS.error, (payload: unknown) => {
    log.debug(`battleship error, resyncing: ${JSON.stringify(payload)}`);
    resyncWanted = true;
  });

  if (state.myFleet === null) {
    await sleep(
      pauseFor(config.pacing.battleshipSetupMs, state.setupDeadline),
      signal,
    );
    if (signal.aborted) return { winnerUserId: null };
    const placements = randomFleet();
    socket.emit(BATTLESHIP_EVENTS.ready, {
      roomId,
      placements,
      mines: randomMines(placements),
    });
  }

  while (!local.over && !signal.aborted) {
    if (resyncWanted) {
      resyncWanted = false;
      applyState(await api.getBattleshipRoomState(roomId));
      continue;
    }

    if (local.turnUserId !== myUserId) {
      // Any of these can end the wait; the timeout re-checks a missed event.
      await Promise.race([
        once(socket, BATTLESHIP_EVENTS.shot, signal, 5_000),
        once(socket, BATTLESHIP_EVENTS.turnTimeout, signal, 5_000),
        once(socket, BATTLESHIP_EVENTS.start, signal, 5_000),
      ]);
      if (local.turnUserId === null) applyState(await api.getBattleshipRoomState(roomId));
      continue;
    }

    await sleep(
      pauseFor(config.pacing.battleshipShotMs, local.turnDeadline),
      signal,
    );
    if (signal.aborted || local.over) break;
    if (local.turnUserId !== myUserId) continue;

    const aim = chooseAim(syntheticFleet(local.revealed), local.myShots);
    if (!aim) {
      applyState(await api.getBattleshipRoomState(roomId));
      continue;
    }
    // Single shots only: power-ups make the bots harder to beat, which is the
    // opposite of the point.
    socket.emit(BATTLESHIP_EVENTS.fire, {
      roomId,
      kind: 'single',
      row: aim.row,
      col: aim.col,
    });

    await Promise.race([
      once(socket, BATTLESHIP_EVENTS.shot, signal, 8_000),
      once(socket, BATTLESHIP_EVENTS.error, signal, 8_000),
    ]);
  }

  return { winnerUserId: local.winnerUserId };
}
