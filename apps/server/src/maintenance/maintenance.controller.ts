import { Controller, Get } from '@nestjs/common';
import type { PlatformStatus } from '@gaming-platform/core';

import { MaintenanceService } from './maintenance.service';

/**
 * Public, unauthenticated, unversioned (excluded from the api/v1 prefix in
 * main.ts, like /health) — clients also use it as their offline-recovery
 * probe, so it must stay reachable without a token. The operator toggle lives
 * in the AdminController (POST /api/v1/admin/maintenance).
 */
@Controller()
export class PlatformStatusController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get('status')
  getStatus(): Promise<PlatformStatus> {
    return this.maintenanceService.getStatus();
  }
}
