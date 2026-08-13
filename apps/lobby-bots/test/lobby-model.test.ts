import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BOT_ACCOUNTS,
  GameRoomStatus,
  GameType,
  type ApiClient,
  type GameRoomSummary,
} from '@gaming-platform/core';

import { LobbyModel } from '../src/orchestrator/lobby-model';

const BOT = 'bot-user-1';
const HUMAN = 'human-user-1';

function room(over: Partial<GameRoomSummary> = {}): GameRoomSummary {
  return {
    id: 'room-1',
    gameType: GameType.NavalBattle,
    status: GameRoomStatus.Pending,
    playerCount: 2,
    joinedCount: 1,
    creatorUserId: HUMAN,
    stakeToken: null,
    stakeAmount: null,
    code: 'ABC123',
    isPrivate: false,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

function modelWith(
  rooms: GameRoomSummary[],
  profiles: { id: string; username: string }[] = [],
): LobbyModel {
  const api = {
    listPendingGameRooms: async () => rooms,
    getUserProfiles: async (ids: string[]) =>
      profiles.filter(profile => ids.includes(profile.id)),
  } as unknown as ApiClient;
  return new LobbyModel(api, new Set([BOT]));
}

test('a room hosted by one of our accounts is a bot room', async () => {
  const model = modelWith(
    [room({ id: 'mine', creatorUserId: BOT }), room({ id: 'theirs', creatorUserId: HUMAN })],
    [{ id: HUMAN, username: 'a_real_player' }],
  );
  await model.reconcile();
  await model.classifyHosts();

  assert.deepEqual(
    model.botHostedRooms().map(r => r.id),
    ['mine'],
  );
  assert.deepEqual(
    model.humanRooms().map(entry => entry.room.id),
    ['theirs'],
  );
});

test('bot rooms still count toward the open-room floor', async () => {
  const model = modelWith([
    room({ id: 'mine', creatorUserId: BOT }),
    room({ id: 'theirs', creatorUserId: HUMAN }),
  ]);
  await model.reconcile();

  assert.equal(model.openRooms().length, 2);
});

test('private rooms are not lobby rooms', async () => {
  const model = modelWith([room({ id: 'hidden', isPrivate: true })]);
  await model.reconcile();

  assert.equal(model.openRooms().length, 0);
  assert.equal(model.humanRooms().length, 0);
});

test('age is floored by when we first saw the room', async () => {
  const old = new Date(Date.now() - 600_000).toISOString();
  const model = modelWith(
    [room({ id: 'stale', createdAt: old })],
    [{ id: HUMAN, username: 'a_real_player' }],
  );
  await model.reconcile();
  await model.classifyHosts();

  const [entry] = model.humanRooms();
  // Created ten minutes ago but only just seen: it does not instantly qualify.
  assert.ok(entry!.ageMs < 1_000, `age was ${entry!.ageMs}ms`);
});

test('reconcile drops rooms the server no longer lists', async () => {
  const live: GameRoomSummary[] = [room({ id: 'a' }), room({ id: 'b' })];
  const api = {
    listPendingGameRooms: async () => live,
  } as unknown as ApiClient;
  const model = new LobbyModel(api, new Set([BOT]));

  await model.reconcile();
  assert.equal(model.openRooms().length, 2);

  live.pop();
  await model.reconcile();
  assert.deepEqual(
    model.openRooms().map(r => r.id),
    ['a'],
  );
});

test('a bot from another roster is recognised by its username, not our ids', async () => {
  const OTHER_BOT = 'bot-user-run-by-someone-else';
  const model = modelWith(
    [
      room({ id: 'other-bot-room', creatorUserId: OTHER_BOT }),
      room({ id: 'human-room', creatorUserId: HUMAN }),
    ],
    [
      { id: OTHER_BOT, username: BOT_ACCOUNTS[0]!.username },
      { id: HUMAN, username: 'a_real_player' },
    ],
  );
  await model.reconcile();
  await model.classifyHosts();

  assert.deepEqual(
    model.humanRooms().map(entry => entry.room.id),
    ['human-room'],
  );
});

test('a host the profile lookup cannot resolve is never treated as human', async () => {
  const model = modelWith([room({ id: 'mystery', creatorUserId: 'ghost' })], []);
  await model.reconcile();
  await model.classifyHosts();

  assert.equal(model.humanRooms().length, 0);
});

test('username matching ignores case', async () => {
  const model = modelWith(
    [room({ id: 'shouty', creatorUserId: 'other' })],
    [{ id: 'other', username: BOT_ACCOUNTS[1]!.username.toUpperCase() }],
  );
  await model.reconcile();
  await model.classifyHosts();

  assert.equal(model.humanRooms().length, 0);
});
