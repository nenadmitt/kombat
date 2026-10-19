import { Controller, Get } from '@nestjs/common';
import type { PlatformStatus } from '@gaming-platform/core';

import { MaintenanceService } from './maintenance.service';

// Unauthenticated: clients also use it as their offline-recovery probe.
@Controller()
export class PlatformStatusController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get('status')
  getStatus(): Promise<PlatformStatus> {
    return this.maintenanceService.getStatus();
  }
}
