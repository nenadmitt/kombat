import type { AddressInfo } from 'net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { CacheKeys, CacheService } from '../../src/cache';
import { LudoDieRoller } from '../../src/games/ludo/ludo.dice';
import { ensureE2eDatabase, truncateAll } from './db';
import { scriptedDice, type ScriptedDice } from './dice';

export type TestApp = {
  app: INestApplication;
  url: string;
  dataSource: DataSource;
  cache: CacheService;
  jwt: JwtService;
  dice: ScriptedDice;
  truncate(): Promise<void>;
  close(): Promise<void>;
};

/**
 * Mirrors `main.ts` — the global prefix and the ValidationPipe are what make
 * routes resolve and DTOs actually validate, so a test app without them
 * passes for the wrong reasons. No RedisIoAdapter: the suite is single
 * instance by construction. The one provider swapped out is the Ludo die:
 * a dice game nothing can script is a game nothing can assert on.
 */
export async function startTestApp(): Promise<TestApp> {
  await ensureE2eDatabase();

  const dice = scriptedDice();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LudoDieRoller)
    .useValue(dice)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'healthcheck', 'status'],
  });
  await app.listen(0, '127.0.0.1');

  const { port } = app.getHttpServer().address() as AddressInfo;
  const dataSource = app.get(DataSource);
  const cache = app.get(CacheService);

  /**
   * Truncating the rows leaves the cache holding matches and deadlines for
   * rooms that no longer exist, and the sweeper goes on enforcing those into
   * whatever test is running by then. Popping with a score past every
   * schedule is what empties the set.
   */
  const truncate = async (): Promise<void> => {
    const rooms: { id: string }[] = await dataSource.query(
      'SELECT id FROM game_rooms',
    );
    const keys = rooms.flatMap(({ id }) => [
      CacheKeys.battleshipMatch(id),
      CacheKeys.battleshipChat(id),
      CacheKeys.battleshipLock(id),
      CacheKeys.ludoMatch(id),
      CacheKeys.ludoLock(id),
      CacheKeys.rpsMatch(id),
      CacheKeys.rpsLock(id),
      CacheKeys.chromaMatch(id),
      CacheKeys.chromaLock(id),
      CacheKeys.salvoMatch(id),
      CacheKeys.salvoLock(id),
      CacheKeys.gameRoom(id),
      CacheKeys.lobbyCreatorSeen(id),
    ]);
    if (keys.length > 0) {
      await cache.del(...keys);
    }
    await cache.popDueDeadlines(Number.MAX_SAFE_INTEGER, 10_000);
    await truncateAll(dataSource);
  };

  return {
    app,
    url: `http://127.0.0.1:${port}`,
    dataSource,
    cache,
    jwt: app.get(JwtService),
    dice,
    truncate,
    close: () => app.close(),
  };
}
