import { UserPlatform } from '@gaming-platform/core';
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
      UserPlatform.Mobile,
    );
    userId = user.id;
  });

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

    const second = await service.refreshSession(first.refreshToken, UserPlatform.Mobile);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.accessToken).toBe(`access-for-${userId}`);
  });

  it('refuses to spend the same refresh token twice', async () => {
    const first = await login();
    await service.refreshSession(first.refreshToken, UserPlatform.Mobile);

    await expect(service.refreshSession(first.refreshToken, UserPlatform.Mobile)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('revokes every session when a used token is replayed', async () => {
    const first = await login();
    const second = await service.refreshSession(first.refreshToken, UserPlatform.Mobile);

    await expect(service.refreshSession(first.refreshToken, UserPlatform.Mobile)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.refreshSession(second.refreshToken, UserPlatform.Mobile)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('only one of two concurrent refreshes wins', async () => {
    const first = await login();

    const results = await Promise.allSettled([
      service.refreshSession(first.refreshToken, UserPlatform.Mobile),
      service.refreshSession(first.refreshToken, UserPlatform.Mobile),
    ]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
  });

  it('rejects an expired refresh token', async () => {
    const { refreshToken } = await login();
    await dataSource.query(
      `UPDATE "refresh_tokens" SET "expires_at" = now() - interval '1 day'`,
    );

    await expect(service.refreshSession(refreshToken, UserPlatform.Mobile)).rejects.toThrow(
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

    await expect(service.refreshSession(refreshToken, UserPlatform.Mobile)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
