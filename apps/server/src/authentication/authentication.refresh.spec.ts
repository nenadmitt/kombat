import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db';
import { RefreshTokenEntity } from '../db/entities/refresh-token.entity';
import { UserEntity } from '../db/entities/user.entity';
import { EmailService } from '../emails/email.service';
import { SiweService } from './siwe.service';
import { createTestDataSource } from '../stake-pot/test/db-harness';
import { AuthenticationService } from './authentication.service';

/**
 * Rotation is the whole point of refresh tokens, so it is tested against real
 * Postgres: the single-use guarantee is a conditional UPDATE, and an in-memory
 * double would only prove the mock behaves.
 */
describe('AuthenticationService (refresh rotation)', () => {
  let dataSource: DataSource;
  let service: AuthenticationService;
  let dbService: DbService;
  let userId: string;

  const jwtService = {
    signAsync: (payload: { sub: string }) =>
      Promise.resolve(`access-for-${payload.sub}`),
  } as unknown as JwtService;

  const config = {
    REFRESH_TOKEN_EXPIRES_IN_DAYS: 30,
    IS_PRODUCTION: false,
    DEMO_LOGIN_CODE: undefined,
    DEMO_LOGIN_EMAIL: 'demo@example.com',
  } as unknown as ConfigurationService;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    const repos = {
      user: dataSource.getRepository(UserEntity),
      refresh: dataSource.getRepository(RefreshTokenEntity),
    };
    dbService = new DbService(
      dataSource,
      repos.user,
      // Only the user + refresh repositories are exercised here.
      undefined as never,
      repos.refresh,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
    service = new AuthenticationService(
      dbService,
      undefined as unknown as EmailService,
      jwtService,
      config,
      undefined as unknown as SiweService,
    );
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    await dataSource.query('TRUNCATE "refresh_tokens", "users" CASCADE');
    const user = await dbService.createUser(
      `refresh-${Date.now()}@example.com`,
    );
    userId = user.id;
  });

  /** issueSession is private; a login is the supported way to mint a pair. */
  const login = () =>
    (
      service as unknown as {
        issueSession: (id: string) => Promise<{
          accessToken: string;
          refreshToken: string;
        }>;
      }
    ).issueSession(userId);

  it('issues a usable pair and rotates it on refresh', async () => {
    const first = await login();
    expect(first.refreshToken).toHaveLength(64);

    const second = await service.refreshSession(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.accessToken).toBe(`access-for-${userId}`);
  });

  it('refuses to spend the same refresh token twice', async () => {
    const first = await login();
    await service.refreshSession(first.refreshToken);

    await expect(service.refreshSession(first.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  /** The theft signal: a revoked token coming back means someone copied it. */
  it('revokes every session when a used token is replayed', async () => {
    const first = await login();
    const second = await service.refreshSession(first.refreshToken);

    // The thief replays the old token...
    await expect(service.refreshSession(first.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
    // ...which must also kill the victim's still-live token.
    await expect(service.refreshSession(second.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('only one of two concurrent refreshes wins', async () => {
    const first = await login();

    const results = await Promise.allSettled([
      service.refreshSession(first.refreshToken),
      service.refreshSession(first.refreshToken),
    ]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
  });

  it('rejects an expired refresh token', async () => {
    const { refreshToken } = await login();
    await dataSource.query(
      `UPDATE "refresh_tokens" SET "expires_at" = now() - interval '1 day'`,
    );

    await expect(service.refreshSession(refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('stores only a hash, never the token itself', async () => {
    const { refreshToken } = await login();
    const [row] = await dataSource.query(
      `SELECT "token_hash" FROM "refresh_tokens"`,
    );
    expect(row.token_hash).not.toBe(refreshToken);
    expect(row.token_hash).toHaveLength(64);
  });

  it('logout revokes the session', async () => {
    const { refreshToken } = await login();
    await service.logout(refreshToken);

    await expect(service.refreshSession(refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
