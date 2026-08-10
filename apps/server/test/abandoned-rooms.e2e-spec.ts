import type { Socket } from 'socket.io-client';
import {
  GameRoomStatus,
  GameType,
  LOBBY_CHANNEL,
  LOBBY_EVENTS,
  ROOM_EVENTS,
} from '@gaming-platform/core';

import { GameRoomEntity } from '../src/db/entities/game-room.entity';
import { startTestApp, type TestApp } from './harness/app';
import { connectSocket, createActor, type Actor } from './harness/actor';
import { subscribe, waitFor, waitUntil } from './harness/events';
import { expireAbandon } from './harness/clock';

const SWEEP_SETTLE_MS = 2_000;

/**
 * A dropped socket must cost a player their not-yet-started room, and nothing
 * else. Each case rewrites the grace deadline into the past and lets the real
 * GameDeadlineSweeper run it, so the production path is what is exercised -
 * including its refusal to act on a room that reconnected or started.
 */
describe('abandoned pending rooms (e2e)', () => {
  let testApp: TestApp;
  let actors: Actor[];
  let extraSockets: Socket[];

  const actor = async (label: string): Promise<Actor> => {
    const created = await createActor(testApp, label);
    actors.push(created);
    return created;
  };

  const roomRow = (id: string): Promise<GameRoomEntity | null> =>
    testApp.dataSource.getRepository(GameRoomEntity).findOneBy({ id });

  /** The disconnect handler may not have scheduled yet, so keep pushing the
   *  member into the past until the sweeper has acted on it. */
  const forceAbandon = (
    roomId: string,
    userId: string,
    done: () => Promise<boolean>,
  ): Promise<boolean> =>
    waitUntil(
      async () => {
        await expireAbandon(testApp, roomId, userId);
        return done();
      },
      15_000,
      250,
    );

  const settle = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

  beforeAll(async () => {
    testApp = await startTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    actors = [];
    extraSockets = [];
    await testApp.truncate();
  });

  afterEach(() => {
    actors.forEach(a => a.disconnect());
    extraSockets.forEach(socket => socket.disconnect());
  });

  it("closes a vanished creator's pending room and clears it from the lobby", async () => {
    const host = await actor('host');
    const watcher = await actor('watcher');
    await subscribe(watcher.socket, LOBBY_CHANNEL);

    const { body: room } = await host.post('/games/rooms', {
      gameType: GameType.NavalBattle,
    });
    const removed = waitFor(watcher.socket, LOBBY_EVENTS.roomRemoved, 15_000);

    host.disconnect();
    await forceAbandon(room.id, host.userId, async () => !(await roomRow(room.id)));

    expect(await removed).toMatchObject({ roomId: room.id });
    expect(await roomRow(room.id)).toBeNull();
  });

  it('frees a vanished joiner\'s seat in a room still waiting to fill', async () => {
    const host = await actor('host');
    const joiner = await actor('joiner');
    const { body: room } = await host.post('/games/rooms', {
      gameType: GameType.Ludo,
    });
    await joiner.post(`/games/rooms/${room.id}/join`);
    const left = waitFor(host.socket, ROOM_EVENTS.playerLeft, 15_000);

    joiner.disconnect();
    await forceAbandon(room.id, joiner.userId, async () => {
      const row = await roomRow(room.id);
      return row?.opponentIds.length === 0;
    });

    expect(await left).toMatchObject({ roomId: room.id, userId: joiner.userId });
    const row = await roomRow(room.id);
    expect(row?.status).toBe(GameRoomStatus.Pending);
    expect(row?.opponentIds).toEqual([]);
  });

  it('keeps the room when the creator reconnects inside the grace window', async () => {
    const host = await actor('host');
    const { body: room } = await host.post('/games/rooms', {
      gameType: GameType.NavalBattle,
    });

    host.disconnect();
    extraSockets.push(await connectSocket(testApp.url, host.token));
    await settle(300);
    await expireAbandon(testApp, room.id, host.userId);
    await settle(SWEEP_SETTLE_MS);

    expect(await roomRow(room.id)).not.toBeNull();
  });

  it('never touches a match that already started', async () => {
    const host = await actor('host');
    const joiner = await actor('joiner');
    const { body: room } = await host.post('/games/rooms', {
      gameType: GameType.NavalBattle,
    });
    await joiner.post(`/games/rooms/${room.id}/join`);

    host.disconnect();
    await expireAbandon(testApp, room.id, host.userId);
    await settle(SWEEP_SETTLE_MS);

    const row = await roomRow(room.id);
    expect(row?.status).toBe(GameRoomStatus.InProgress);
    expect(row?.opponentId).toBe(joiner.userId);
  });
});
