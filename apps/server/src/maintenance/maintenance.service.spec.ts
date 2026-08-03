import { HttpException } from '@nestjs/common';

import { CacheService } from '../cache';
import { DbService } from '../db';
import { WebsocketsService } from '../websockets';
import { MaintenanceService } from './maintenance.service';

describe('MaintenanceService (version gate)', () => {
  const serviceWithFloor = (minAppVersion: string | null) =>
    new MaintenanceService(
      {
        getJson: async () => ({
          maintenance: false,
          message: null,
          minAppVersion,
        }),
        setJson: async () => undefined,
        del: async () => undefined,
      } as unknown as CacheService,
      {} as DbService,
      {} as WebsocketsService,
    );

  it('passes everything while no floor is set', async () => {
    const service = serviceWithFloor(null);
    await expect(service.assertSupportedVersion(undefined)).resolves.toBeUndefined();
    await expect(service.assertSupportedVersion('0.0.1')).resolves.toBeUndefined();
  });

  it('rejects builds below the floor with 426, including no header', async () => {
    const service = serviceWithFloor('1.2.0');
    for (const version of ['1.1.9', '0.9.4', undefined]) {
      const error = await service
        .assertSupportedVersion(version)
        .then(() => null)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(426);
    }
  });

  it('passes builds at or above the floor', async () => {
    const service = serviceWithFloor('1.2.0');
    await expect(service.assertSupportedVersion('1.2.0')).resolves.toBeUndefined();
    await expect(service.assertSupportedVersion('2.0.0')).resolves.toBeUndefined();
    await expect(service.assertSupportedVersion('1.10.0')).resolves.toBeUndefined();
  });
});
