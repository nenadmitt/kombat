import { io } from 'socket.io-client';
import type { JwtSignOptions } from '@nestjs/jwt';
import { BATTLESHIP_EVENTS, GameType } from '@gaming-platform/core';

import { startTestApp, type TestApp } from './harness/app';
import { createActor, type Actor } from './harness/actor';
import { subscribe, waitFor } from './harness/events';
import {
  FAR_MINES,
  FIXED_FLEET,
  SHIP_CELLS,
} from './harness/fixtures/battleship';

describe('session expiry (e2e)', () => {
  let testApp: TestApp;
  let actors: Actor[];
  let host: Actor;
  let joiner: Actor;
  let roomId: string;

  const actor = async (
    label: string,
    tokenOptions?: JwtSignOptions,
  ): Promise<Actor> => {
    const created = await createActor(testApp, label, tokenOptions);
    actors.push(created);
    return created;
  };

  const startMatch = async (): Promise<void> => {
    const { body: room } = await host.post('/games/rooms', {
      gameType: GameType.NavalBattle,
    });
    roomId = room.id;
    await joiner.post(`/games/rooms/${roomId}/join`);

    const channel = `game:${roomId}`;
    await subscribe(host.socket, channel);
    await subscribe(joiner.socket, channel);

    host.socket.emit(BATTLESHIP_EVENTS.enter, { roomId });
    joiner.socket.emit(BATTLESHIP_EVENTS.enter, { roomId });
    await waitFor(host.socket, BATTLESHIP_EVENTS.setupState);

    const started = waitFor(host.socket, BATTLESHIP_EVENTS.start);
    for (const who of [host, joiner]) {
      who.socket.emit(BATTLESHIP_EVENTS.ready, {
        roomId,
        placements: FIXED_FLEET,
        mines: FAR_MINES,
      });
    }
    await started;
  };

  const connectWith = (token: string) =>
    new Promise<{ connected: boolean; reason: string }>(resolve => {
      const socket = io(testApp.url, {
        auth: { token },
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      });
      // Resolve before disconnecting: disconnect() fires the local listener synchronously.
      let settled = false;
      const settle = (connected: boolean, reason: string) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve({ connected, reason });
        socket.disconnect();
      };
      socket.once('connect', () =>
        setTimeout(() => settle(socket.connected, 'stayed'), 300),
      );
      socket.once('connect_error', error => settle(false, `error: ${error.message}`));
      socket.once('disconnect', reason => settle(false, `disconnect: ${reason}`));
    });

  beforeAll(async () => {
    testApp = await startTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    actors = [];
    await testApp.truncate();
    host = await actor('host');
    joiner = await actor('joiner');
  });

  afterEach(() => {
    actors.forEach(a => a.disconnect());
  });

  it('keeps an established socket playable after its token expires', async () => {
    const issuedAt = Date.now();
    // An account gets one socket, so probing with a second connection would kick the match socket.
    host = await actor('short-session-host', { expiresIn: '5s' });
    await startMatch();

    await new Promise(resolve =>
      setTimeout(resolve, Math.max(0, 5_500 - (Date.now() - issuedAt))),
    );

    // The gateway authenticates once, in handleConnection, so the open socket survives the lapse.
    const shot = waitFor<{ cells: { result: string }[] }>(
      host.socket,
      BATTLESHIP_EVENTS.shot,
    );
    host.socket.emit(BATTLESHIP_EVENTS.fire, {
      roomId,
      kind: 'single',
      ...SHIP_CELLS[0]!,
    });
    expect((await shot).cells[0]!.result).toBe('hit');

    // Kicks the match socket, so it has to come after the shot above.
    expect(await connectWith(host.token)).toMatchObject({
      connected: false,
      reason: 'disconnect: io server disconnect',
    });
  });

  it('refuses a reconnect that presents the expired token', async () => {
    const expired = await testApp.jwt.signAsync(
      { sub: host.userId },
      { expiresIn: '1s' },
    );
    await new Promise(resolve => setTimeout(resolve, 1_500));

    expect(await connectWith(expired)).toMatchObject({
      connected: false,
      reason: 'disconnect: io server disconnect',
    });
  });

  it('accepts a reconnect that presents a refreshed token', async () => {
    const refreshed = await testApp.jwt.signAsync({ sub: host.userId });

    expect(await connectWith(refreshed)).toMatchObject({ connected: true, reason: 'stayed' });
  });
});
