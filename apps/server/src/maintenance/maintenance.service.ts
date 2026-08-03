import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ErrorCode,
  PLATFORM_EVENTS,
  isVersionBelow,
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
const APP_VERSION_SETTING_KEY = 'app-version';

type MaintenanceSetting = { enabled: boolean; message: string | null };

export type AppVersionSetting = {
  minAppVersion: string | null;
  latestAppVersion: string | null;
  updateMessage: string | null;
  updateNotes: string[];
  updateSizeLabel: string | null;
  updateUrls: { ios: string | null; android: string | null };
};

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
    const [maintenance, appVersion] = await Promise.all([
      this.dbService.getAppSetting<MaintenanceSetting>(MAINTENANCE_SETTING_KEY),
      this.dbService.getAppSetting<AppVersionSetting>(APP_VERSION_SETTING_KEY),
    ]);
    const status: PlatformStatus = {
      maintenance: maintenance?.enabled ?? false,
      message: maintenance?.message ?? null,
      minAppVersion: appVersion?.minAppVersion ?? null,
      latestAppVersion: appVersion?.latestAppVersion ?? null,
      updateMessage: appVersion?.updateMessage ?? null,
      updateNotes: appVersion?.updateNotes ?? [],
      updateSizeLabel: appVersion?.updateSizeLabel ?? null,
      updateUrls: appVersion?.updateUrls ?? { ios: null, android: null },
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
    await this.dbService.upsertAppSetting(MAINTENANCE_SETTING_KEY, {
      enabled,
      message: message ?? null,
    } satisfies MaintenanceSetting);
    this.logger.log(`Maintenance mode ${enabled ? 'ENABLED' : 'disabled'}`);
    return this.publishStatus();
  }

  async setAppVersionPolicy(
    policy: AppVersionSetting,
  ): Promise<PlatformStatus> {
    await this.dbService.upsertAppSetting(APP_VERSION_SETTING_KEY, policy);
    this.logger.log(
      `App version floor ${policy.minAppVersion ?? 'cleared'} (latest ${policy.latestAppVersion ?? '-'})`,
    );
    return this.publishStatus();
  }

  /** Recompose from the DB, refresh the cache, and push to every client. */
  private async publishStatus(): Promise<PlatformStatus> {
    await this.cacheService.del(CacheKeys.platformStatus());
    const status = await this.getStatus();
    // Live flip: every connected client reacts without polling.
    this.websocketsService.broadcast(PLATFORM_EVENTS.maintenance, status);
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

  /**
   * Version gate for routes that must not accept outdated builds (room
   * create/join/start, pot deposit/withdraw). Like maintenance, gameplay
   * paths are exempt so live matches drain instead of forfeiting on a
   * ticking turn clock. No header counts as below the floor: every build
   * that predates the header also predates any floor we would set.
   */
  async assertSupportedVersion(
    clientVersion: string | undefined,
  ): Promise<void> {
    const status = await this.getStatus();
    if (!status.minAppVersion) {
      return;
    }
    if (isVersionBelow(clientVersion ?? '0.0.0', status.minAppVersion)) {
      throw new HttpException(
        {
          message: 'This version of the app is no longer supported. Update to keep playing.',
          code: ErrorCode.UpdateRequired,
        },
        426, // Upgrade Required - predates HttpStatus's enum.
      );
    }
  }
}
