import { io } from 'socket.io-client';
import {
  GameRoomStatus,
  GameType,
  LOBBY_CHANNEL,
  LOBBY_EVENTS,
  ROOM_EVENTS,
} from '@gaming-platform/core';

import { GameRoomEntity } from '../src/db/entities/game-room.entity';
import { startTestApp, type TestApp } from './harness/app';
import { createActor, type Actor } from './harness/actor';
import { expectNoEvent, waitFor } from './harness/events';

describe('room lifecycle (e2e)', () => {
  let testApp: TestApp;
  let actors: Actor[];

  const actor = async (label: string): Promise<Actor> => {
    const created = await createActor(testApp, label);
    actors.push(created);
    return created;
  };

  const createRoom = (host: Actor) =>
    host.post('/games/rooms', { gameType: GameType.NavalBattle });

  beforeAll(async () => {
    testApp = await startTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    actors = [];
    await testApp.truncate();
  });

  afterEach(() => {
    actors.forEach(a => a.disconnect());
  });

  describe('socket authentication', () => {
    it('accepts a socket carrying a valid JWT', async () => {
      const player = await actor('player');
      expect(player.socket.connected).toBe(true);
    });

    it('disconnects a socket with an invalid token', async () => {
      const socket = io(testApp.url, {
        auth: { token: 'not-a-real-jwt' },
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      });

      const rejected = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Socket was never rejected')),
          4_000,
        );
        const settle = () => {
          clearTimeout(timer);
          resolve();
        };
        socket.once('connect_error', settle);
        socket.once('disconnect', settle);
      });

      await rejected;
      expect(socket.connected).toBe(false);
      socket.disconnect();
    });
  });

  describe('creating a room', () => {
    it('creates a pending room for the caller', async () => {
      const host = await actor('host');

      const { status, body } = await createRoom(host);

      expect(status).toBe(201);
      expect(body).toMatchObject({
        gameType: GameType.NavalBattle,
        status: GameRoomStatus.Pending,
      });
      expect(body.id).toEqual(expect.any(String));
    });

    it('rejects a second room from the same user', async () => {
      const host = await actor('host');
      await createRoom(host);

      const { status, body } = await createRoom(host);

      expect(status).toBe(409);
      expect(body.message).toContain('already have an active game room');
    });

    it('announces the new room to the lobby', async () => {
      const host = await actor('host');
      const watcher = await actor('watcher');
      await watcher.socket.emitWithAck('channel:join', {
        channel: LOBBY_CHANNEL,
      });

      const added = waitFor<{ id: string }>(
        watcher.socket,
        LOBBY_EVENTS.roomAdded,
      );
      const { body } = await createRoom(host);

      expect(await added).toMatchObject({ id: body.id });
    });
  });

  describe('joining a room', () => {
    it('notifies the creator when an opponent joins', async () => {
      const host = await actor('host');
      const joiner = await actor('joiner');
      const { body: room } = await createRoom(host);

      const opponentJoined = waitFor<{ roomId: string }>(
        host.socket,
        ROOM_EVENTS.opponentJoined,
      );
      const { status } = await joiner.post(`/games/rooms/${room.id}/join`);

      expect(status).toBe(201);
      expect(await opponentJoined).toEqual({ roomId: room.id });
    });

    it('flips the room to in-progress and seats the joiner', async () => {
      const host = await actor('host');
      const joiner = await actor('joiner');
      const { body: room } = await createRoom(host);

      await joiner.post(`/games/rooms/${room.id}/join`);

      const stored = await testApp.dataSource
        .getRepository(GameRoomEntity)
        .findOneBy({ id: room.id });
      expect(stored).toMatchObject({
        status: GameRoomStatus.InProgress,
        opponentId: joiner.userId,
      });
    });

    it('refuses to let the creator join their own room', async () => {
      const host = await actor('host');
      const { body: room } = await createRoom(host);

      const { status, body } = await host.post(`/games/rooms/${room.id}/join`);

      expect(status).toBe(409);
      expect(body.message).toContain('cannot join your own game room');
    });

    it('refuses a third player once the room is full', async () => {
      const host = await actor('host');
      const joiner = await actor('joiner');
      const latecomer = await actor('latecomer');
      const { body: room } = await createRoom(host);
      await joiner.post(`/games/rooms/${room.id}/join`);

      const { status, body } = await latecomer.post(
        `/games/rooms/${room.id}/join`,
      );

      expect(status).toBe(409);
      expect(body.message).toContain('no longer accepting players');
    });

    it('drops the filled room from the lobby', async () => {
      const host = await actor('host');
      const joiner = await actor('joiner');
      const watcher = await actor('watcher');
      const { body: room } = await createRoom(host);
      await watcher.socket.emitWithAck('channel:join', {
        channel: LOBBY_CHANNEL,
      });

      const removed = waitFor<{ roomId: string }>(
        watcher.socket,
        LOBBY_EVENTS.roomRemoved,
      );
      await joiner.post(`/games/rooms/${room.id}/join`);

      expect(await removed).toEqual({ roomId: room.id });
    });
  });

  describe('game channel access', () => {
    it('delivers room broadcasts to participants but not to outsiders', async () => {
      const host = await actor('host');
      const joiner = await actor('joiner');
      const outsider = await actor('outsider');
      const { body: room } = await createRoom(host);
      await joiner.post(`/games/rooms/${room.id}/join`);

      const channel = `game:${room.id}`;
      await expect(
        joiner.socket.emitWithAck('channel:join', { channel }),
      ).resolves.toEqual({ ok: true, channel });
      await expect(
        outsider.socket.emitWithAck('channel:join', { channel }),
      ).resolves.toEqual({ ok: false, channel });

      const delivered = waitFor(joiner.socket, 'game:message');
      const withheld = expectNoEvent(outsider.socket, 'game:message', 1_000);
      host.socket.emit('game:message', { roomId: room.id, text: 'hello' });

      await expect(delivered).resolves.toBeDefined();
      await withheld;
    });
  });
});
