import { GameRoomStatus, GameType } from '@gaming-platform/core';

import { startTestApp, type TestApp } from './harness/app';
import { createActor, type Actor } from './harness/actor';

describe('forfeit eliminates for good (e2e)', () => {
  let testApp: TestApp;
  let actors: Actor[];

  const actor = async (label: string): Promise<Actor> => {
    const created = await createActor(testApp, label);
    actors.push(created);
    return created;
  };

  const startedLudo = async (
    host: Actor,
    joiners: Actor[],
  ): Promise<string> => {
    const { body: room } = await host.post('/games/rooms', {
      gameType: GameType.Ludo,
    });
    for (const joiner of joiners) {
      await joiner.post(`/games/rooms/${room.id}/join`);
    }
    await host.post(`/games/rooms/${room.id}/start`);
    await host.get(`/games/rooms/${room.id}/state`);
    return room.id;
  };

  beforeAll(async () => {
    testApp = await startTestApp();
  });

  beforeEach(async () => {
    actors = [];
    await testApp.truncate();
  });

  afterEach(() => {
    actors.forEach(a => a.disconnect());
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('a forfeited match stops being your active room', async () => {
    const host = await actor('host');
    const [a, b] = [await actor('a'), await actor('b')];
    const roomId = await startedLudo(host, [a, b]);

    const { status } = await a.post(`/games/rooms/${roomId}/forfeit`);
    expect(status).toBe(201);

    const { body: active } = await a.get('/games/rooms/mine');
    expect(active).toBeNull();

    const { body: hostActive } = await host.get('/games/rooms/mine');
    expect(hostActive).toMatchObject({
      id: roomId,
      status: GameRoomStatus.InProgress,
    });
  });

  it('a second forfeit is refused and cannot void the live match', async () => {
    const host = await actor('host');
    const [a, b] = [await actor('a'), await actor('b')];
    const roomId = await startedLudo(host, [a, b]);

    await a.post(`/games/rooms/${roomId}/forfeit`);
    const { status } = await a.post(`/games/rooms/${roomId}/forfeit`);
    expect(status).toBe(409);

    const [row] = await testApp.dataSource.query(
      `SELECT status, winner_user_id FROM game_rooms WHERE id = $1`,
      [roomId],
    );
    expect(row.status).toBe(GameRoomStatus.InProgress);
    expect(row.winner_user_id).toBeNull();
  });

  it('the last opponent forfeiting ends the match with a winner', async () => {
    const host = await actor('host');
    const [a, b] = [await actor('a'), await actor('b')];
    const roomId = await startedLudo(host, [a, b]);

    await a.post(`/games/rooms/${roomId}/forfeit`);
    await b.post(`/games/rooms/${roomId}/forfeit`);

    const [row] = await testApp.dataSource.query(
      `SELECT status, winner_user_id FROM game_rooms WHERE id = $1`,
      [roomId],
    );
    expect(row.status).toBe(GameRoomStatus.Completed);
    expect(row.winner_user_id).toBe(host.userId);
  });

  it('an eliminated player can host again', async () => {
    const host = await actor('host');
    const [a, b] = [await actor('a'), await actor('b')];
    const roomId = await startedLudo(host, [a, b]);

    await a.post(`/games/rooms/${roomId}/forfeit`);

    const { status } = await a.post('/games/rooms', {
      gameType: GameType.NavalBattle,
    });
    expect(status).toBe(201);
  });
});
