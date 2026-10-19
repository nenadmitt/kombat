import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';

import { MaintenanceService } from './maintenance.service';

@Injectable()
export class SupportedVersionGuard implements CanActivate {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    // The web client always runs the deploy it was served, so the store-build floor doesn't apply.
    if (headerValue(request, 'x-app-platform') === 'web') return true;
    const header = request.headers['x-app-version'];
    await this.maintenanceService.assertSupportedVersion(
      Array.isArray(header) ? header[0] : header,
    );
    return true;
  }
}

function headerValue(request: Request, name: string): string | undefined {
  const raw = request.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}
