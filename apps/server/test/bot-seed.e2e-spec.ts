import { BOT_ACCOUNTS, UserPlatform } from '@gaming-platform/core';

import { startTestApp, type TestApp } from './harness/app';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const describeWithToken = ADMIN_TOKEN ? describe : describe.skip;

describeWithToken('bot seeding (e2e)', () => {
  let testApp: TestApp;

  const seed = (body: unknown = {}) =>
    fetch(`${testApp.url}/api/v1/admin/bots/seed`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-token': ADMIN_TOKEN!,
      },
      body: JSON.stringify(body),
    });

  const rows = (): Promise<
    { email: string; username: string; is_bot: boolean; wallets: string }[]
  > =>
    testApp.dataSource.query(
      `SELECT u.email, u.username, u.is_bot, u.ens_name,
              (SELECT count(*) FROM wallets w WHERE w.user_id = u.id) AS wallets
         FROM users u WHERE u.is_bot ORDER BY u.email`,
    );

  beforeAll(async () => {
    testApp = await startTestApp();
  });

  beforeEach(async () => {
    await testApp.truncate();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('creates the roster with an email, a username and one wallet each', async () => {
    const response = await seed({ count: 5 });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      created: BOT_ACCOUNTS.slice(0, 5).map(a => a.username),
      walletsAttached: BOT_ACCOUNTS.slice(0, 5).map(a => a.username),
      alreadyPresent: [],
    });

    const seeded = await rows();
    expect(seeded).toHaveLength(5);
    const byEmail = new Map(seeded.map(row => [row.email, row]));
    for (const account of BOT_ACCOUNTS.slice(0, 5)) {
      const row = byEmail.get(account.email);
      expect(row).toBeDefined();
      expect(row!.username).toBe(account.username);
      expect(row!.is_bot).toBe(true);
      expect(Number(row!.wallets)).toBe(1);
    }
  });

  it('does not mint an ENS name for a bot', async () => {
    await seed({ count: 3 });

    const [{ count }] = await testApp.dataSource.query(
      `SELECT count(*) FROM users WHERE is_bot AND ens_name IS NOT NULL`,
    );
    expect(Number(count)).toBe(0);
  });

  it('seeds bots as web accounts, so their wallets are custodial', async () => {
    await seed({ count: 2 });

    const wallets = await testApp.dataSource.query(
      `SELECT u.platform, w.type, w.encrypted_private_key IS NOT NULL AS has_key
         FROM users u JOIN wallets w ON w.user_id = u.id WHERE u.is_bot`,
    );
    expect(wallets).toHaveLength(2);
    for (const wallet of wallets) {
      expect(wallet.platform).toBe(UserPlatform.Web);
      expect(wallet.has_key).toBe(true);
    }
  });

  it('is idempotent: a second run adds no users and no wallets', async () => {
    await seed({ count: 4 });
    const before = await rows();

    const second = await seed({ count: 4 });
    expect(await second.json()).toMatchObject({
      created: [],
      walletsAttached: [],
      alreadyPresent: BOT_ACCOUNTS.slice(0, 4).map(a => a.username),
    });

    expect(await rows()).toEqual(before);
  });

  it('re-flags a bot whose is_bot was cleared, without touching its name', async () => {
    await seed({ count: 2 });
    await testApp.dataSource.query(
      `UPDATE users SET is_bot = false WHERE email = $1`,
      [BOT_ACCOUNTS[0]!.email],
    );

    await seed({ count: 2 });

    const [row] = await testApp.dataSource.query(
      `SELECT is_bot, username FROM users WHERE email = $1`,
      [BOT_ACCOUNTS[0]!.email],
    );
    expect(row.is_bot).toBe(true);
    expect(row.username).toBe(BOT_ACCOUNTS[0]!.username);
  });

  it('refuses without the admin token', async () => {
    const response = await fetch(`${testApp.url}/api/v1/admin/bots/seed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ count: 1 }),
    });
    expect(response.status).toBe(401);

    expect(await rows()).toHaveLength(0);
  });
});
