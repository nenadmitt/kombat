import {
  GameRoomStatus,
  GameType,
  LOBBY_CHANNEL,
  LOBBY_EVENTS,
} from '@gaming-platform/core';

import { startTestApp, type TestApp } from './harness/app';
import { createActor, type Actor } from './harness/actor';
import { waitFor } from './harness/events';

describe('joining releases your own room (e2e)', () => {
  let testApp: TestApp;
  let actors: Actor[];

  const actor = async (label: string): Promise<Actor> => {
    const created = await createActor(testApp, label);
    actors.push(created);
    return created;
  };

  const createRoom = (host: Actor, gameType = GameType.NavalBattle) =>
    host.post('/games/rooms', { gameType });

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

  it('closes the room I was hosting when I take a seat elsewhere', async () => {
    const me = await actor('me');
    const other = await actor('other');
    const { body: mine } = await createRoom(me);
    const { body: theirs } = await createRoom(other);

    const { status } = await me.post(`/games/rooms/${theirs.id}/join`);
    expect(status).toBe(201);

    const { body: active } = await me.get('/games/rooms/mine');
    expect(active).toMatchObject({ id: theirs.id });

    const rows = await testApp.dataSource.query(
      `SELECT id FROM game_rooms WHERE id = $1`,
      [mine.id],
    );
    expect(rows).toHaveLength(0);
  });

  it('tells the lobby the abandoned room is gone', async () => {
    const me = await actor('me');
    const other = await actor('other');
    const watcher = await actor('watcher');
    await watcher.socket.emitWithAck('channel:join', { channel: LOBBY_CHANNEL });

    const { body: mine } = await createRoom(me);
    const { body: theirs } = await createRoom(other, GameType.Ludo);

    const removed = waitFor<{ roomId: string }>(
      watcher.socket,
      LOBBY_EVENTS.roomRemoved,
      6_000,
    );
    await me.post(`/games/rooms/${theirs.id}/join`);

    expect(await removed).toEqual({ roomId: mine.id });
  });

  it('leaves a multi-seat room I joined intact', async () => {
    const me = await actor('me');
    const host = await actor('host');
    const { body: theirs } = await createRoom(host, GameType.Ludo);

    await me.post(`/games/rooms/${theirs.id}/join`);

    const { body: room } = await host.get(`/games/rooms/mine`);
    expect(room).toMatchObject({
      id: theirs.id,
      status: GameRoomStatus.Pending,
      joinedCount: 2,
    });
  });

  it('refuses a room I create while sitting in someone else\'s', async () => {
    const me = await actor('me');
    const host = await actor('host');
    const { body: theirs } = await createRoom(host, GameType.Ludo);
    await me.post(`/games/rooms/${theirs.id}/join`);

    const { status } = await createRoom(me);

    expect(status).toBe(409);
    const rows = await testApp.dataSource.query(
      `SELECT id FROM game_rooms WHERE user_id = $1`,
      [me.userId],
    );
    expect(rows).toHaveLength(0);
  });

  it('gives up a seat I held when I take another one', async () => {
    const me = await actor('me');
    const first = await actor('first');
    const second = await actor('second');
    const { body: roomA } = await createRoom(first, GameType.Ludo);
    const { body: roomB } = await createRoom(second, GameType.Ludo);

    await me.post(`/games/rooms/${roomA.id}/join`);
    await me.post(`/games/rooms/${roomB.id}/join`);

    const [a] = await testApp.dataSource.query(
      `SELECT opponent_ids FROM game_rooms WHERE id = $1`,
      [roomA.id],
    );
    const [b] = await testApp.dataSource.query(
      `SELECT opponent_ids FROM game_rooms WHERE id = $1`,
      [roomB.id],
    );
    expect(a.opponent_ids).not.toContain(me.userId);
    expect(b.opponent_ids).toContain(me.userId);
  });

  it('refuses a join while I am in a live match', async () => {
    const me = await actor('me');
    const opponent = await actor('opponent');
    const third = await actor('third');
    const { body: mine } = await createRoom(me);
    await opponent.post(`/games/rooms/${mine.id}/join`);

    const { body: theirs } = await createRoom(third, GameType.Ludo);
    const { status } = await me.post(`/games/rooms/${theirs.id}/join`);

    expect(status).toBe(409);
  });

  it('does not touch a match I am already playing', async () => {
    const me = await actor('me');
    const opponent = await actor('opponent');
    const third = await actor('third');
    const { body: mine } = await createRoom(me);
    await opponent.post(`/games/rooms/${mine.id}/join`);

    const { body: theirs } = await createRoom(third, GameType.Ludo);
    await me.post(`/games/rooms/${theirs.id}/join`);

    const [row] = await testApp.dataSource.query(
      `SELECT status FROM game_rooms WHERE id = $1`,
      [mine.id],
    );
    expect(row.status).toBe(GameRoomStatus.InProgress);
  });
});
