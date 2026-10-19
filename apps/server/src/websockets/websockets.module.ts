import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../authentication';
import { DbModule } from '../db/db.module';
import { WebsocketsGateway } from './websockets.gateway';
import { WebsocketsService } from './websockets.service';

@Module({
  imports: [AuthenticationModule, DbModule],
  providers: [WebsocketsGateway, WebsocketsService],
  exports: [WebsocketsService],
})
export class WebsocketsModule {}
