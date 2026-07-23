import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { PlatformStatus } from '@gaming-platform/core';

import { AdminTokenGuard } from './admin-token.guard';
import { SetMaintenanceDto } from './maintenance.dto';
import { MaintenanceService } from './maintenance.service';

/**
 * Public, unauthenticated, unversioned (excluded from the api/v1 prefix in
 * main.ts, like /health) — clients also use it as their offline-recovery
 * probe, so it must stay reachable without a token.
 */
@Controller()
export class PlatformStatusController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get('status')
  getStatus(): Promise<PlatformStatus> {
    return this.maintenanceService.getStatus();
  }
}

/** Operator toggle, e.g.
 *  `curl -X POST .../api/v1/admin/maintenance -H "x-admin-token: $ADMIN_TOKEN"
 *   -H "Content-Type: application/json" -d '{"enabled": true}'` */
@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminMaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post('maintenance')
  setMaintenance(@Body() dto: SetMaintenanceDto): Promise<PlatformStatus> {
    return this.maintenanceService.setMaintenance(dto.enabled, dto.message);
  }
}
