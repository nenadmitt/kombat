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
import { ConcedePolicy } from '../src/orchestrator/concede-policy';

const silent = { ...createLogger('test'), info: () => {}, error: () => {} };
const NOW = { min: 0, max: 0 };

function room(over: Partial<GameRoomSummary> = {}): GameRoomSummary {
  return {
    id: 'room-1',
    gameType: GameType.Ludo,
    status: GameRoomStatus.InProgress,
    playerCount: 4,
    joinedCount: 4,
    creatorUserId: 'u1',
    stakeToken: null,
    stakeAmount: null,
    code: 'ABC123',
    isPrivate: false,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

type FakeBot = BotRuntime & { forfeited: string[] };

function bot(userId: string, seat: GameRoomSummary | null): FakeBot {
  const forfeited: string[] = [];
  return {
    account: { username: userId, email: `${userId}@bots.local` },
    userId,
    state: seat ? 'playing' : 'idle',
    room: seat,
    forfeited,
    api: {
      forfeitGameRoom: async (id: string) => {
        forfeited.push(id);
        return { winnerUserId: null };
      },
    },
  } as unknown as FakeBot;
}

const config = () =>
  ({ ...loadConfig(), concedeDelayMs: NOW }) as ReturnType<typeof loadConfig>;

const settle = () => new Promise(resolve => setTimeout(resolve, 20));

test('an all-bot match leaves exactly one bot standing', async () => {
  const seat = room();
  const bots = ['u1', 'u2', 'u3', 'u4'].map(id => bot(id, seat));
  const policy = new ConcedePolicy(bots, config(), silent);

  await policy.tick();
  await settle();

  const conceded = bots.filter(b => b.forfeited.length > 0);
  assert.equal(conceded.length, 3);
});

test('a match with a human in it is played out', async () => {
  // Three of the four seats are ours; the fourth is a real player.
  const seat = room();
  const bots = ['u1', 'u2', 'u3'].map(id => bot(id, seat));
  const policy = new ConcedePolicy(bots, config(), silent);

  await policy.tick();
  await settle();

  assert.deepEqual(
    bots.flatMap(b => b.forfeited),
    [],
  );
});

test('a two-player match against a human is played out', async () => {
  const seat = room({ gameType: GameType.NavalBattle, playerCount: 2 });
  const bots = [bot('u1', seat)];
  const policy = new ConcedePolicy(bots, config(), silent);

  await policy.tick();
  await settle();

  assert.deepEqual(bots[0]!.forfeited, []);
});

test('every bot in the room picks the same winner', async () => {
  const seat = room();
  const ids = ['u1', 'u2', 'u3', 'u4'];
  const survivors = new Set<string>();

  // Seat order should not change who wins.
  for (const order of [ids, [...ids].reverse()]) {
    const bots = order.map(id => bot(id, seat));
    const policy = new ConcedePolicy(bots, config(), silent);
    await policy.tick();
    await settle();
    const standing = bots.filter(b => b.forfeited.length === 0);
    assert.equal(standing.length, 1);
    survivors.add(standing[0]!.userId);
  }

  assert.equal(survivors.size, 1);
});

test('a room is only decided once', async () => {
  const seat = room();
  const bots = ['u1', 'u2', 'u3', 'u4'].map(id => bot(id, seat));
  const policy = new ConcedePolicy(bots, config(), silent);

  await policy.tick();
  await policy.tick();
  await settle();

  for (const b of bots) {
    assert.ok(b.forfeited.length <= 1, `${b.userId} conceded twice`);
  }
});

test('a room started short-handed still concedes', async () => {
  // Three bots in a 4-seat room the host started early: capacity says 4, but
  // there is no fourth player and nobody is coming.
  const seat = room({ joinedCount: 3 });
  const bots = ['u1', 'u2', 'u3'].map(id => bot(id, seat));
  const policy = new ConcedePolicy(bots, config(), silent);

  await policy.tick();
  await settle();

  assert.equal(bots.filter(b => b.forfeited.length > 0).length, 2);
});

test('a short-handed room with a human in it is played out', async () => {
  // Two bots, but three players took seats - the third is a real player.
  const seat = room({ joinedCount: 3 });
  const bots = ['u1', 'u2'].map(id => bot(id, seat));
  const policy = new ConcedePolicy(bots, config(), silent);

  await policy.tick();
  await settle();

  assert.deepEqual(bots.flatMap(b => b.forfeited), []);
});
