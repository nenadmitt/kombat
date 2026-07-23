import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  ErrorCode,
  PLATFORM_EVENTS,
  type PlatformStatus,
} from '@gaming-platform/core';

import {
  CacheKeys,
  CacheService,
  PLATFORM_STATUS_TTL_SECONDS,
} from '../cache';
import { DbService } from '../db';
import { WebsocketsService } from '../websockets';

const MAINTENANCE_SETTING_KEY = 'maintenance';

type MaintenanceSetting = { enabled: boolean; message: string | null };

/**
 * Runtime-togglable maintenance mode. The DB row is the truth (survives
 * restarts); the cache is a read-through layer so the flag check on every
 * room create/join/start doesn't hit Postgres each time.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly dbService: DbService,
    private readonly websocketsService: WebsocketsService,
  ) {}

  async getStatus(): Promise<PlatformStatus> {
    const cached = await this.cacheService.getJson<PlatformStatus>(
      CacheKeys.platformStatus(),
    );
    if (cached) {
      return cached;
    }
    const setting = await this.dbService.getAppSetting<MaintenanceSetting>(
      MAINTENANCE_SETTING_KEY,
    );
    const status: PlatformStatus = {
      maintenance: setting?.enabled ?? false,
      message: setting?.message ?? null,
    };
    await this.cacheService.setJson(
      CacheKeys.platformStatus(),
      status,
      PLATFORM_STATUS_TTL_SECONDS,
    );
    return status;
  }

  async setMaintenance(
    enabled: boolean,
    message?: string,
  ): Promise<PlatformStatus> {
    const status: PlatformStatus = {
      maintenance: enabled,
      message: message ?? null,
    };
    await this.dbService.upsertAppSetting(MAINTENANCE_SETTING_KEY, {
      enabled,
      message: message ?? null,
    } satisfies MaintenanceSetting);
    await this.cacheService.setJson(
      CacheKeys.platformStatus(),
      status,
      PLATFORM_STATUS_TTL_SECONDS,
    );
    // Live flip: every connected client swaps its banner without polling.
    this.websocketsService.broadcast(PLATFORM_EVENTS.maintenance, status);
    this.logger.log(`Maintenance mode ${enabled ? 'ENABLED' : 'disabled'}`);
    return status;
  }

  /**
   * Multiplayer gate: rejects room create/join/start while maintenance is
   * on. Deliberately NOT called from match gameplay paths — in-flight
   * matches keep running so live games drain naturally.
   */
  async assertNotInMaintenance(): Promise<void> {
    const status = await this.getStatus();
    if (status.maintenance) {
      throw new ServiceUnavailableException({
        message:
          status.message ??
          'Multiplayer is temporarily unavailable for maintenance.',
        code: ErrorCode.Maintenance,
      });
    }
  }
}
