import { Module } from '@nestjs/common';

import { MaintenanceModule } from '../maintenance';
import { WebsocketsModule } from '../websockets';
import { BotSeedService } from '../bots/bot-seed.service';
import { AdminTokenGuard } from './admin-token.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [WebsocketsModule, MaintenanceModule],
  controllers: [AdminController],
  providers: [AdminService, AdminTokenGuard, BotSeedService],
  exports: [AdminTokenGuard],
})
export class AdminModule {}
