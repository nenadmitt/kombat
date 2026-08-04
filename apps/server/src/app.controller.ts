import { Controller, Get, HttpException } from '@nestjs/common';

import { CacheService } from './cache';
import { ConfigurationService } from './configuration/configuration.service';
import { DbService } from './db';
import { INSTANCE_ID } from './instance-id';
import { adapterState } from './websockets/redis-io.adapter';

/** Cap a dependency probe so a hung connection can't stall the endpoint. */
const PROBE_TIMEOUT_MS = 2_000;

type DependencyStatus = 'up' | 'down' | 'not-configured';

function withTimeout(probe: Promise<void>): Promise<void> {
  return Promise.race([
    probe,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('probe timed out')), PROBE_TIMEOUT_MS),
    ),
  ]);
}

@Controller()
export class AppController {
  constructor(
    private readonly cacheService: CacheService,
    private readonly dbService: DbService,
    private readonly configurationService: ConfigurationService,
  ) {}

  /** Cheap liveness: the process is up and which cache backend it chose. */
  @Get('health')
  health() {
    return {
      status: 'ok',
      cache: this.cacheService.driver,
      instance: INSTANCE_ID,
      socketAdapter: adapterState.mode,
    };
  }

  /**
   * Readiness with dependency round-trips: Postgres (SELECT 1) and Redis
   * (PING). 200 only when every configured dependency answers; 503 with the
   * per-dependency verdict otherwise, so orchestrators can gate traffic on
   * it. Redis is optional by design - unset REDIS_URL reports
   * `not-configured` and stays healthy (in-memory single-instance mode);
   * a configured REDIS_URL running on the memory fallback means the boot
   * connection failed and reports `down`.
   */
  @Get('healthcheck')
  async healthcheck() {
    let postgres: DependencyStatus = 'up';
    try {
      await withTimeout(this.dbService.pingDatabase());
    } catch {
      postgres = 'down';
    }

    let redis: DependencyStatus;
    if (this.cacheService.driver === 'redis') {
      try {
        await withTimeout(this.cacheService.ping());
        redis = 'up';
      } catch {
        redis = 'down';
      }
    } else {
      redis = this.configurationService.REDIS_URL ? 'down' : 'not-configured';
    }

    const healthy = postgres === 'up' && redis !== 'down';
    const body = {
      status: healthy ? 'ok' : 'unhealthy',
      postgres,
      redis,
      cache: this.cacheService.driver,
      instance: INSTANCE_ID,
      socketAdapter: adapterState,
    };
    if (!healthy) {
      throw new HttpException(body, 503);
    }
    return body;
  }
}
