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
    joinedCount: 1,
    creatorUserId: 'host-user',
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
        return ludoRoom({ id, joinedCount: 2 });
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

test('a bot takes a seat in a bot-hosted room once the wait elapses', async () => {
  const host = bot('host', { state: 'hosting', room: ludoRoom() });
  const filler = bot('filler');
  const policy = new FillPolicy(
    [host, filler],
    config({ seatFillFirstMs: ZERO, seatFillNextMs: NEVER, earlyStartChance: 0 }),
    silent,
  );

  await policy.tick();

  assert.deepEqual(filler.joined, ['ludo-1']);
  assert.equal(filler.state, 'joining');
});

test('seats are taken one at a time, not all at once', async () => {
  const host = bot('host', { state: 'hosting', room: ludoRoom() });
  const fillers = [bot('a'), bot('b'), bot('c')];
  const policy = new FillPolicy(
    [host, ...fillers],
    config({ seatFillFirstMs: ZERO, seatFillNextMs: NEVER, earlyStartChance: 0 }),
    silent,
  );

  await policy.tick();
  await policy.tick();
  await policy.tick();

  const total = fillers.reduce((sum, f) => sum + f.joined.length, 0);
  assert.equal(total, 1, 'the next seat must wait for its own delay');
});

test('a two-player room is never self-filled', async () => {
  const host = bot('host', {
    state: 'hosting',
    room: ludoRoom({ gameType: GameType.NavalBattle, playerCount: 2 }),
  });
  const filler = bot('filler');
  const policy = new FillPolicy(
    [host, filler],
    config({ seatFillFirstMs: ZERO, earlyStartChance: 0 }),
    silent,
  );

  await policy.tick();

  assert.deepEqual(filler.joined, []);
});

test('a full room is left to the server to start', async () => {
  const host = bot('host', {
    state: 'hosting',
    room: ludoRoom({ joinedCount: 4 }),
  });
  const filler = bot('filler');
  const policy = new FillPolicy(
    [host, filler],
    config({ seatFillFirstMs: ZERO, earlyStartChance: 1 }),
    silent,
  );

  await policy.tick();

  assert.deepEqual(filler.joined, []);
  assert.deepEqual(host.started, []);
});

test('an early-starting host starts a startable room after its delay', async () => {
  const host = bot('host', { state: 'hosting', room: ludoRoom({ joinedCount: 3 }) });
  const policy = new FillPolicy(
    [host],
    config({
      earlyStartChance: 1,
      earlyStartMs: ZERO,
      seatFillFirstMs: NEVER,
    }),
    silent,
  );

  await policy.tick(); // schedules the start
  await policy.tick(); // deadline already passed

  assert.deepEqual(host.started, ['ludo-1']);
});

test('a waiting host never starts short-handed', async () => {
  const host = bot('host', { state: 'hosting', room: ludoRoom({ joinedCount: 3 }) });
  const policy = new FillPolicy(
    [host],
    config({ earlyStartChance: 0, earlyStartMs: ZERO, seatFillFirstMs: NEVER }),
    silent,
  );

  await policy.tick();
  await policy.tick();

  assert.deepEqual(host.started, []);
});

test('a room below the minimum is not startable, however keen the host', async () => {
  const host = bot('host', { state: 'hosting', room: ludoRoom({ joinedCount: 1 }) });
  const policy = new FillPolicy(
    [host],
    config({ earlyStartChance: 1, earlyStartMs: ZERO, seatFillFirstMs: NEVER }),
    silent,
  );

  await policy.tick();
  await policy.tick();

  assert.deepEqual(host.started, []);
});

test('an early-starting host stops filling once it has its target', async () => {
  const host = bot('host', { state: 'hosting', room: ludoRoom({ joinedCount: 3 }) });
  const filler = bot('filler');
  const policy = new FillPolicy(
    [host, filler],
    config({
      earlyStartChance: 1,
      earlyStartMs: NEVER,
      seatFillFirstMs: ZERO,
      seatFillNextMs: ZERO,
    }),
    silent,
  );

  await policy.tick();
  await policy.tick();

  assert.deepEqual(filler.joined, []);
});

test('a waiting host fills all the way to a full table', async () => {
  const host = bot('host', { state: 'hosting', room: ludoRoom({ joinedCount: 3 }) });
  const filler = bot('filler');
  const policy = new FillPolicy(
    [host, filler],
    config({ earlyStartChance: 0, seatFillFirstMs: ZERO, seatFillNextMs: ZERO }),
    silent,
  );

  await policy.tick();

  assert.deepEqual(filler.joined, ['ludo-1']);
});

test('a human-hosted room is filled on the same slow schedule', async () => {
  // The seated bot is a joiner, not a host: it fills, but never starts.
  const seated = bot('seated', { state: 'joining', room: ludoRoom({ joinedCount: 2 }) });
  const filler = bot('filler');
  const policy = new FillPolicy(
    [seated, filler],
    config({ seatFillFirstMs: ZERO, seatFillNextMs: NEVER, earlyStartChance: 1, earlyStartMs: ZERO }),
    silent,
  );

  await policy.tick();
  await policy.tick();

  assert.deepEqual(filler.joined, ['ludo-1'], 'should still fill');
  assert.deepEqual(seated.started, [], 'a joiner may not start the room');
});

test('two bots in one room do not double-fill it', async () => {
  const room = ludoRoom({ joinedCount: 2 });
  const host = bot('host', { state: 'hosting', room });
  const seated = bot('seated', { state: 'joining', room });
  const fillers = [bot('a'), bot('b')];
  const policy = new FillPolicy(
    [host, seated, ...fillers],
    config({ seatFillFirstMs: ZERO, seatFillNextMs: NEVER, earlyStartChance: 0 }),
    silent,
  );

  await policy.tick();

  const total = fillers.reduce((sum, f) => sum + f.joined.length, 0);
  assert.equal(total, 1);
});
