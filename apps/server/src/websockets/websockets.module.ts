import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../authentication';
import { DbModule } from '../db/db.module';
import { WebsocketsGateway } from './websockets.gateway';
import { WebsocketsService } from './websockets.service';

@Module({
  // DbModule: game-channel subscriptions are authorized against the room's
  // participant list.
  imports: [AuthenticationModule, DbModule],
  providers: [WebsocketsGateway, WebsocketsService],
  exports: [WebsocketsService],
})
export class WebsocketsModule {}
