import { Module } from '@nestjs/common';

import { MaintenanceModule } from '../maintenance';
import { WebsocketsModule } from '../websockets';
import { BotSeedService } from '../bots/bot-seed.service';
import { AdminTokenGuard } from './admin-token.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * The operator surface: user administration, live users/games and the
 * maintenance toggle, all behind the AdminTokenGuard. DbService and
 * ConfigurationService are global; WebsocketsModule supplies live presence and
 * MaintenanceModule the maintenance service.
 */
@Module({
  imports: [WebsocketsModule, MaintenanceModule],
  controllers: [AdminController],
  providers: [AdminService, AdminTokenGuard, BotSeedService],
  // The guard is exported so other modules can put their own operator-only
  // endpoints behind the same token (e.g. the stake pot's reconciliation read).
  exports: [AdminTokenGuard],
})
export class AdminModule {}
