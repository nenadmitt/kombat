import { GameType } from '@gaming-platform/core';

import { GameRoomStatus } from '../src/db/types/game';
import { startTestApp, type TestApp } from './harness/app';
import { createActor, type Actor } from './harness/actor';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

describe('bot accounts (e2e)', () => {
  let testApp: TestApp;
  let actors: Actor[];

  const actor = async (label: string): Promise<Actor> => {
    const created = await createActor(testApp, label);
    actors.push(created);
    return created;
  };

  const completedMatch = async (winner: Actor, loser: Actor): Promise<void> => {
    await testApp.dataSource.query(
      `INSERT INTO game_rooms
         (user_id, opponent_id, game_type, status, player_count,
          winner_user_id, is_private, code)
       VALUES ($1, $2, $3, $4, 2, $1, false, $5)`,
      [
        winner.userId,
        loser.userId,
        GameType.NavalBattle,
        GameRoomStatus.Completed,
        Math.random().toString(36).slice(2, 8).toUpperCase(),
      ],
    );
  };

  const rankings = async (asker: Actor) =>
    asker.get<{ userId: string; username: string }[]>('/rankings');

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

  it('keeps a flagged bot out of the rankings but keeps its human opponent', async () => {
    const human = await actor('human');
    const bot = await actor('botplayer');
    await completedMatch(bot, human);

    const before = await rankings(human);
    expect(before.body.map(r => r.userId).sort()).toEqual(
      [human.userId, bot.userId].sort(),
    );

    await testApp.dataSource.query(
      `UPDATE users SET is_bot = true WHERE id = $1`,
      [bot.userId],
    );

    const after = await rankings(human);
    expect(after.body.map(r => r.userId)).toEqual([human.userId]);
  });

  it('defaults existing and new accounts to not-a-bot', async () => {
    const player = await actor('player');
    const [row] = await testApp.dataSource.query(
      `SELECT is_bot FROM users WHERE id = $1`,
      [player.userId],
    );

    expect(row.is_bot).toBe(false);
  });

  describe('PATCH admin/users/:id/bot', () => {
    const patch = (id: string, token: string | null, body: unknown) =>
      fetch(`${testApp.url}/api/v1/admin/users/${id}/bot`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'x-admin-token': token } : {}),
        },
        body: JSON.stringify(body),
      });

    it('rejects a missing or wrong admin token', async () => {
      const player = await actor('player');

      expect((await patch(player.userId, null, { isBot: true })).status).toBe(401);
      expect(
        (await patch(player.userId, 'not-the-token', { isBot: true })).status,
      ).toBe(401);

      const [row] = await testApp.dataSource.query(
        `SELECT is_bot FROM users WHERE id = $1`,
        [player.userId],
      );
      expect(row.is_bot).toBe(false);
    });

    (ADMIN_TOKEN ? it : it.skip)('flags and unflags an account', async () => {
      const player = await actor('player');

      const on = await patch(player.userId, ADMIN_TOKEN!, { isBot: true });
      expect(on.status).toBe(200);
      expect(await on.json()).toMatchObject({ id: player.userId, isBot: true });

      const off = await patch(player.userId, ADMIN_TOKEN!, { isBot: false });
      expect(await off.json()).toMatchObject({ isBot: false });
    });

    (ADMIN_TOKEN ? it : it.skip)('404s for an unknown user', async () => {
      const missing = '019ff000-0000-7000-8000-000000000000';
      expect((await patch(missing, ADMIN_TOKEN!, { isBot: true })).status).toBe(
        404,
      );
    });

    (ADMIN_TOKEN ? it : it.skip)('rejects a non-boolean flag', async () => {
      const player = await actor('player');
      expect(
        (await patch(player.userId, ADMIN_TOKEN!, { isBot: 'yes' })).status,
      ).toBe(400);
    });
  });
});
