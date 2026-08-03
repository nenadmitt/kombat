import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';

import { MaintenanceService } from './maintenance.service';

/** Rejects builds below the platform's version floor with 426. */
@Injectable()
export class SupportedVersionGuard implements CanActivate {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['x-app-version'];
    await this.maintenanceService.assertSupportedVersion(
      Array.isArray(header) ? header[0] : header,
    );
    return true;
  }
}
