import { BOT_ACCOUNTS, GameType } from '@gaming-platform/core';

import { GameRoomStatus } from '../src/db/types/game';
import { startTestApp, type TestApp } from './harness/app';
import { createActor, type Actor } from './harness/actor';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const describeWithToken = ADMIN_TOKEN ? describe : describe.skip;

describeWithToken('admin stats (e2e)', () => {
  let testApp: TestApp;
  let actors: Actor[];

  const actor = async (label: string): Promise<Actor> => {
    const created = await createActor(testApp, label);
    actors.push(created);
    return created;
  };

  const admin = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${testApp.url}/api/v1/admin/${path}`, {
      headers: { 'x-admin-token': ADMIN_TOKEN! },
    });
    return (await response.json()) as T;
  };

  const seedBots = (count: number) =>
    fetch(`${testApp.url}/api/v1/admin/bots/seed`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-token': ADMIN_TOKEN!,
      },
      body: JSON.stringify({ count }),
    });

  /** A finished room, played out or voided depending on `winner`. */
  const room = (
    creator: Actor,
    joiner: Actor,
    status: GameRoomStatus,
    winner: Actor | null,
  ) =>
    testApp.dataSource.query(
      `INSERT INTO game_rooms
         (user_id, opponent_id, game_type, status, player_count,
          winner_user_id, is_private, code)
       VALUES ($1, $2, $3, $4, 2, $5, false, $6)`,
      [
        creator.userId,
        joiner.userId,
        GameType.NavalBattle,
        status,
        winner?.userId ?? null,
        Math.random().toString(36).slice(2, 8).toUpperCase(),
      ],
    );

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

  it('counts only matches that were played, and reports the rest separately', async () => {
    const a = await actor('a');
    const b = await actor('b');
    await room(a, b, GameRoomStatus.Completed, a); // played
    await room(a, b, GameRoomStatus.Completed, b); // played
    await room(a, b, GameRoomStatus.Completed, null); // voided
    await room(a, b, GameRoomStatus.InProgress, null); // running
    await room(a, b, GameRoomStatus.Pending, null); // waiting

    const { games } = await admin<{
      games: { played: number; voided: number; pending: number; inProgress: number; total: number };
    }>('stats');

    expect(games.played).toBe(2);
    expect(games.voided).toBe(1);
    expect(games.inProgress).toBe(1);
    expect(games.pending).toBe(1);
    // total is every room ever created; played is the headline number.
    expect(games.total).toBe(5);
  });

  it('a user\'s games count is played matches, not rooms touched', async () => {
    const a = await actor('a');
    const b = await actor('b');
    await room(a, b, GameRoomStatus.Completed, a);
    await room(a, b, GameRoomStatus.Completed, null); // voided
    await room(a, b, GameRoomStatus.Pending, null);

    const users = await admin<{ id: string; games: number }[]>('stats/users');
    const row = users.find(u => u.id === a.userId);
    expect(row?.games).toBe(1);
  });

  it('bots are marked, kept out of the player count, and never online', async () => {
    await seedBots(2);
    const human = await actor('human'); // holds an open socket

    const overview = await admin<{
      users: { total: number; bots: number; online: number };
    }>('stats');
    expect(overview.users.bots).toBe(2);
    expect(overview.users.total).toBe(1);
    expect(overview.users.online).toBe(1);

    const users = await admin<
      { username: string | null; isBot: boolean; online: boolean }[]
    >('stats/users');
    const bots = users.filter(u => u.isBot);
    expect(bots.map(u => u.username).sort()).toEqual(
      BOT_ACCOUNTS.slice(0, 2).map(a => a.username).sort(),
    );
    expect(bots.every(u => u.online === false)).toBe(true);

    const me = users.find(u => u.username === 'human');
    expect(me).toMatchObject({ isBot: false, online: true });
  });

  it('the active-users list has no bots in it', async () => {
    await seedBots(1);
    await actor('human');

    const active = await admin<{ isBot: boolean }[]>('users/active');
    expect(active.some(u => u.isBot)).toBe(false);
    expect(active).toHaveLength(1);
  });
});
