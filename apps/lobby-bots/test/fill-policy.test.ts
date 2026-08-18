import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  GameRoomStatus,
  GameType,
  type GameRoomSummary,
} from '@gaming-platform/core';

import type { BotRuntime } from '../src/bot/bot-runtime';
import { loadConfig } from '../src/config';
import { createLogger } from '../src/logger';
import { FillPolicy } from '../src/orchestrator/fill-policy';

const silent = { ...createLogger('test'), info: () => {}, error: () => {} };

function ludoRoom(over: Partial<GameRoomSummary> = {}): GameRoomSummary {
  return {
    id: 'ludo-1',
    gameType: GameType.Ludo,
    status: GameRoomStatus.Pending,
    playerCount: 4,
    joinedCount: 2,
    creatorUserId: 'human-host',
    stakeToken: null,
    stakeAmount: null,
    code: 'ABC123',
    isPrivate: false,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

type FakeBot = BotRuntime & { joined: string[]; started: string[] };

function bot(name: string, over: Partial<BotRuntime> = {}): FakeBot {
  const joined: string[] = [];
  const started: string[] = [];
  const self = {
    account: { username: name, email: `${name}@bots.local` },
    state: 'idle',
    room: null,
    hostedUntil: 0,
    joined,
    started,
    get isIdle() {
      return self.state === 'idle';
    },
    reset() {
      self.state = 'idle';
      self.room = null;
    },
    play() {},
    api: {
      joinGameRoom: async (id: string) => {
        joined.push(id);
        return ludoRoom({ id, joinedCount: 3 });
      },
      startGameRoom: async (id: string) => {
        started.push(id);
        return ludoRoom({ id, status: GameRoomStatus.InProgress });
      },
    },
    ...over,
  } as unknown as FakeBot;
  return self;
}

function config(over: Record<string, unknown> = {}) {
  return { ...loadConfig(), ...over } as ReturnType<typeof loadConfig>;
}

const ZERO = { min: 0, max: 0 };
const NEVER = { min: 1_000_000, max: 1_000_000 };

// A bot that "joined" is sitting at a human's table; a bot that is "hosting"
// has a room with nobody real in it.

test('a table a human hosts gets filled once a bot is seated there', async () => {
  const seated = bot('seated', { state: 'joining', room: ludoRoom() });
  const filler = bot('filler');
  const policy = new FillPolicy(
    [seated, filler],
    config({ seatFillFirstMs: ZERO, seatFillNextMs: NEVER }),
    silent,
  );

  await policy.tick();

  assert.deepEqual(filler.joined, ['ludo-1']);
  assert.equal(filler.state, 'joining');
});

test('a bot-hosted table with no human in it is never filled', async () => {
  const host = bot('host', {
    state: 'hosting',
    room: ludoRoom({ creatorUserId: 'bot-host', joinedCount: 1 }),
  });
  const fillers = [bot('a'), bot('b'), bot('c')];
  const policy = new FillPolicy(
    [host, ...fillers],
    config({ seatFillFirstMs: ZERO, seatFillNextMs: ZERO }),
    silent,
  );

  await policy.tick();
  await policy.tick();
  await policy.tick();

  assert.deepEqual(
    fillers.flatMap(f => f.joined),
    [],
    'bots must not seat themselves at a bot-only table',
  );
});

test('a bot never starts a table short-handed - that is the host\'s call', async () => {
  const seated = bot('seated', { state: 'joining', room: ludoRoom({ joinedCount: 3 }) });
  const policy = new FillPolicy(
    [seated],
    config({ seatFillFirstMs: NEVER, seatFillNextMs: NEVER }),
    silent,
  );

  await policy.tick();
  await policy.tick();

  assert.deepEqual(seated.started, []);
});

test('seats are taken one at a time, not all at once', async () => {
  const seated = bot('seated', { state: 'joining', room: ludoRoom() });
  const fillers = [bot('a'), bot('b'), bot('c')];
  const policy = new FillPolicy(
    [seated, ...fillers],
    config({ seatFillFirstMs: ZERO, seatFillNextMs: NEVER }),
    silent,
  );

  await policy.tick();
  await policy.tick();
  await policy.tick();

  const total = fillers.reduce((sum, f) => sum + f.joined.length, 0);
  assert.equal(total, 1, 'the next seat must wait for its own delay');
});

test('a two-player room is never self-filled', async () => {
  const seated = bot('seated', {
    state: 'joining',
    room: ludoRoom({ gameType: GameType.NavalBattle, playerCount: 2, joinedCount: 2 }),
  });
  const filler = bot('filler');
  const policy = new FillPolicy(
    [seated, filler],
    config({ seatFillFirstMs: ZERO }),
    silent,
  );

  await policy.tick();

  assert.deepEqual(filler.joined, []);
});

test('a full table is left alone', async () => {
  const seated = bot('seated', { state: 'joining', room: ludoRoom({ joinedCount: 4 }) });
  const filler = bot('filler');
  const policy = new FillPolicy(
    [seated, filler],
    config({ seatFillFirstMs: ZERO }),
    silent,
  );

  await policy.tick();

  assert.deepEqual(filler.joined, []);
});

test('two bots at one human table do not double-fill it', async () => {
  const room = ludoRoom({ joinedCount: 3 });
  const seatedA = bot('a', { state: 'joining', room });
  const seatedB = bot('b', { state: 'joining', room });
  const fillers = [bot('c'), bot('d')];
  const policy = new FillPolicy(
    [seatedA, seatedB, ...fillers],
    config({ seatFillFirstMs: ZERO, seatFillNextMs: NEVER }),
    silent,
  );

  await policy.tick();

  const total = fillers.reduce((sum, f) => sum + f.joined.length, 0);
  assert.equal(total, 1);
});
