import { BOT_ACCOUNTS } from '@gaming-platform/core';

import { startTestApp, type TestApp } from './harness/app';
import { createActor, type Actor } from './harness/actor';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const BOT_SECRET = process.env.BOT_SECRET;
const describeWithSecrets = ADMIN_TOKEN && BOT_SECRET ? describe : describe.skip;

describeWithSecrets('bot login (e2e)', () => {
  let testApp: TestApp;
  let actors: Actor[];

  const login = (username: string, secret: string) =>
    fetch(`${testApp.url}/api/v1/authentication/bot-login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-platform': 'web' },
      body: JSON.stringify({ username, secret }),
    });

  const seed = (count: number) =>
    fetch(`${testApp.url}/api/v1/admin/bots/seed`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-token': ADMIN_TOKEN!,
      },
      body: JSON.stringify({ count }),
    });

  beforeAll(async () => {
    testApp = await startTestApp();
  });

  beforeEach(async () => {
    actors = [];
    await testApp.truncate();
  });

  afterEach(() => {
    actors.forEach(actor => actor.disconnect());
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('signs in a seeded bot and the session works', async () => {
    await seed(2);
    const bot = BOT_ACCOUNTS[0]!;

    const response = await login(bot.username, BOT_SECRET!);
    expect(response.status).toBe(201);
    const session = (await response.json()) as { accessToken: string };
    expect(session.accessToken).toEqual(expect.any(String));

    const me = await fetch(`${testApp.url}/api/v1/users/me`, {
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'x-app-platform': 'web',
      },
    });
    expect(await me.json()).toMatchObject({ username: bot.username });
  });

  it('refuses a wrong secret', async () => {
    await seed(1);
    const response = await login(BOT_ACCOUNTS[0]!.username, 'not-the-secret-at-all');
    expect(response.status).toBe(401);
  });

  it('refuses a real player even with the right secret', async () => {
    const human = await createActor(testApp, 'human');
    actors.push(human);

    const response = await login('human', BOT_SECRET!);
    expect(response.status).toBe(401);
  });

  it('refuses an unknown username, and says no more than for a wrong secret', async () => {
    await seed(1);
    const unknown = await login('nobody_here', BOT_SECRET!);
    const wrongSecret = await login(BOT_ACCOUNTS[0]!.username, 'wrong-secret-value');

    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrongSecret.json());
  });

  it('refuses a bot whose flag was cleared', async () => {
    await seed(1);
    const bot = BOT_ACCOUNTS[0]!;
    await testApp.dataSource.query(
      `UPDATE users SET is_bot = false WHERE username = $1`,
      [bot.username],
    );

    expect((await login(bot.username, BOT_SECRET!)).status).toBe(401);
  });

  it('does not create an account for an unseeded roster name', async () => {
    const bot = BOT_ACCOUNTS[0]!;
    expect((await login(bot.username, BOT_SECRET!)).status).toBe(401);

    const [{ count }] = await testApp.dataSource.query(
      `SELECT count(*) FROM users WHERE username = $1`,
      [bot.username],
    );
    expect(Number(count)).toBe(0);
  });
});
