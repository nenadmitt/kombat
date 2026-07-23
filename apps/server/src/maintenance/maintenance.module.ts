import { Module } from '@nestjs/common';

import { WebsocketsModule } from '../websockets';
import { AdminTokenGuard } from './admin-token.guard';
import {
  AdminMaintenanceController,
  PlatformStatusController,
} from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [WebsocketsModule],
  controllers: [PlatformStatusController, AdminMaintenanceController],
  providers: [MaintenanceService, AdminTokenGuard],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
