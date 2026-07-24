import { Module } from '@nestjs/common';

import { WebsocketsModule } from '../websockets';
import { PlatformStatusController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [WebsocketsModule],
  controllers: [PlatformStatusController],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
