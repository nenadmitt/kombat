import type { AddressInfo } from 'net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { CacheService } from '../../src/cache';
import { ensureE2eDatabase, truncateAll } from './db';

export type TestApp = {
  app: INestApplication;
  url: string;
  dataSource: DataSource;
  cache: CacheService;
  jwt: JwtService;
  truncate(): Promise<void>;
  close(): Promise<void>;
};

/**
 * Mirrors `main.ts` — the global prefix and the ValidationPipe are what make
 * routes resolve and DTOs actually validate, so a test app without them
 * passes for the wrong reasons. No RedisIoAdapter: the suite is single
 * instance by construction.
 */
export async function startTestApp(): Promise<TestApp> {
  await ensureE2eDatabase();

  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'healthcheck', 'status'],
  });
  await app.listen(0, '127.0.0.1');

  const { port } = app.getHttpServer().address() as AddressInfo;
  const dataSource = app.get(DataSource);

  return {
    app,
    url: `http://127.0.0.1:${port}`,
    dataSource,
    cache: app.get(CacheService),
    jwt: app.get(JwtService),
    truncate: () => truncateAll(dataSource),
    close: () => app.close(),
  };
}
