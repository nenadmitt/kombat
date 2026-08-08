import { UserPlatform, WalletNetwork } from '@gaming-platform/core';

import { startTestApp, type TestApp } from './harness/app';
import { createActor, type Actor } from './harness/actor';
import { UserEntity } from '../src/db/entities/user.entity';
import { WalletEntity } from '../src/db/entities/wallet.entity';
import { WalletOrigin } from '../src/db/types/wallet';
import { decryptPrivateKey, parseEncryptionKey } from '../src/wallets/key-cipher.util';

/**
 * Account platform (web vs mobile) and the two custody models behind it.
 * Everything goes over real HTTP against a real database - the wallet route
 * is guarded, so "does an unauthenticated caller get a wallet" is a question
 * only the wired-up app can answer.
 */
describe('accounts and wallets (e2e)', () => {
  let testApp: TestApp;
  let actors: Actor[] = [];

  const actor = async (
    label: string,
    platform: UserPlatform = UserPlatform.Mobile,
  ): Promise<Actor> => {
    const created = await createActor(testApp, label, undefined, platform);
    actors.push(created);
    return created;
  };

  /** Raw HTTP, so the unauthenticated and malformed-token cases are reachable. */
  const call = async (
    method: string,
    path: string,
    options: { token?: string; body?: unknown; platform?: 'web' | 'mobile' } = {},
  ) => {
    const response = await fetch(`${testApp.url}/api/v1${path}`, {
      method,
      headers: {
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.platform ? { 'X-App-Platform': options.platform } : {}),
        ...(options.body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };

  const walletRowFor = (userId: string) =>
    testApp.dataSource
      .getRepository(WalletEntity)
      .createQueryBuilder('w')
      // The column is `select: false`, so it has to be asked for explicitly.
      .addSelect('w.encryptedPrivateKey')
      .where('w.user_id = :userId', { userId })
      .getOne();

  beforeAll(async () => {
    testApp = await startTestApp();
  });

  afterAll(async () => {
    await testApp?.close();
  });

  beforeEach(async () => {
    await testApp.truncate();
    actors = [];
  });

  afterEach(() => {
    actors.forEach(a => a.disconnect());
  });

  describe('POST /wallets authorization', () => {
    it('refuses an unauthenticated caller', async () => {
      const { status } = await call('POST', '/wallets', {
        body: { network: WalletNetwork.Ethereum },
      });
      expect(status).toBe(401);
    });

    it('refuses a garbage bearer token', async () => {
      const { status } = await call('POST', '/wallets', {
        token: 'not.a.jwt',
        body: { network: WalletNetwork.Ethereum },
      });
      expect(status).toBe(401);
    });

    it('refuses an expired token', async () => {
      const expired = await createActor(testApp, 'expired-holder', {
        expiresIn: '-1s',
      });
      actors.push(expired);
      const { status } = await call('POST', '/wallets', {
        token: expired.token,
        body: { network: WalletNetwork.Ethereum },
      });
      expect(status).toBe(401);
    });

    it('refuses a token signed by someone else', async () => {
      const forged = [
        Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
          'base64url',
        ),
        Buffer.from(JSON.stringify({ sub: crypto.randomUUID() })).toString(
          'base64url',
        ),
        'forged-signature',
      ].join('.');
      const { status } = await call('POST', '/wallets', {
        token: forged,
        body: { network: WalletNetwork.Ethereum },
      });
      expect(status).toBe(401);
    });

    it('creates a wallet for a valid token, once', async () => {
      const player = await actor('mobile-once');

      const first = await player.post('/wallets', {
        network: WalletNetwork.Ethereum,
      });
      expect(first.status).toBe(201);
      expect(first.body.address).toMatch(/^0x[0-9a-fA-F]{40}$/);

      const second = await player.post('/wallets', {
        network: WalletNetwork.Ethereum,
      });
      expect(second.status).toBe(409);
    });
  });

  describe('custody follows the account platform', () => {
    it('keeps no key for a mobile account', async () => {
      const player = await actor('mobile-custody', UserPlatform.Mobile);
      const { status } = await player.post('/wallets', {
        network: WalletNetwork.Ethereum,
      });
      expect(status).toBe(201);

      const wallet = await walletRowFor(player.userId);
      expect(wallet?.type).toBe(WalletOrigin.Platform);
      expect(wallet?.encryptedPrivateKey ?? null).toBeNull();
    });

    it('stores an encrypted key for a web account', async () => {
      const player = await actor('web-custody', UserPlatform.Web);
      const { status, body } = await player.post('/wallets', {
        network: WalletNetwork.Ethereum,
      });
      expect(status).toBe(201);

      const wallet = await walletRowFor(player.userId);
      expect(wallet?.type).toBe(WalletOrigin.Embedded);
      expect(wallet?.encryptedPrivateKey).toMatch(/^v1:/);

      // It is the real key, and it is genuinely encrypted at rest.
      const key = parseEncryptionKey(process.env.W_ENCRYPT);
      const privateKey = decryptPrivateKey(wallet!.encryptedPrivateKey!, key);
      expect(privateKey).toMatch(/^0x[0-9a-f]{64}$/);
      expect(wallet!.encryptedPrivateKey).not.toContain(privateKey);

      // The mnemonic is handed over once; the key never leaves the server.
      expect(body.mnemonic.split(' ')).toHaveLength(12);
      expect(JSON.stringify(body)).not.toContain(privateKey);
    });

    it('never exposes the stored key through the wallets list', async () => {
      const player = await actor('web-list', UserPlatform.Web);
      await player.post('/wallets', { network: WalletNetwork.Ethereum });

      const { status, body } = await player.get('/wallets');
      expect(status).toBe(200);
      expect(JSON.stringify(body)).not.toMatch(/v1:|encryptedPrivateKey/);
    });
  });

  describe('an account signs in only from the app that created it', () => {
    /** Drives the real OTP flow; request-token/test returns the code. */
    const signIn = async (email: string, platform: 'web' | 'mobile') => {
      const requested = await call('POST', '/authentication/request-token/test', {
        body: { email },
        platform,
      });
      if (requested.status !== 201 && requested.status !== 200) {
        return { status: requested.status, body: requested.body, session: null };
      }
      const exchanged = await call('POST', '/authentication/exchange-token', {
        body: { email, token: requested.body.token },
        platform,
      });
      const ok = exchanged.status === 200 || exchanged.status === 201;
      return {
        status: exchanged.status,
        body: exchanged.body,
        session: ok ? exchanged.body : null,
      };
    };

    it('stamps a new email account with the caller platform', async () => {
      const email = 'stamped-web@e2e.local';
      const result = await signIn(email, 'web');
      expect(result.session).not.toBeNull();

      const user = await testApp.dataSource
        .getRepository(UserEntity)
        .findOneBy({ email });
      expect(user?.platform).toBe(UserPlatform.Web);
    });

    it('treats a missing platform header as mobile', async () => {
      const email = 'no-header@e2e.local';
      const requested = await call(
        'POST',
        '/authentication/request-token/test',
        { body: { email } },
      );
      await call('POST', '/authentication/exchange-token', {
        body: { email, token: requested.body.token },
      });

      const user = await testApp.dataSource
        .getRepository(UserEntity)
        .findOneBy({ email });
      expect(user?.platform).toBe(UserPlatform.Mobile);
    });

    it('refuses a web account from the mobile app', async () => {
      const email = 'web-only@e2e.local';
      expect((await signIn(email, 'web')).session).not.toBeNull();

      const crossed = await signIn(email, 'mobile');
      expect(crossed.status).toBe(403);
      expect(crossed.body.message).toMatch(/web app/i);
    });

    it('refuses a mobile account from the web app', async () => {
      const email = 'mobile-only@e2e.local';
      expect((await signIn(email, 'mobile')).session).not.toBeNull();

      const crossed = await signIn(email, 'web');
      expect(crossed.status).toBe(403);
      expect(crossed.body.message).toMatch(/mobile app/i);
    });

    it('refuses a refresh token presented from the other app', async () => {
      const email = 'refresh-split@e2e.local';
      const { session } = await signIn(email, 'web');
      expect(session).not.toBeNull();

      // The login check counts for nothing if a copied refresh token can walk
      // around it from the other client.
      const crossed = await call('POST', '/authentication/refresh', {
        body: { refreshToken: session!.refreshToken },
        platform: 'mobile',
      });
      expect(crossed.status).toBe(403);

      const same = await call('POST', '/authentication/refresh', {
        body: { refreshToken: session!.refreshToken },
        platform: 'web',
      });
      expect(same.status).toBe(200);
      expect(same.body.accessToken).toBeTruthy();
    });
  });
});
