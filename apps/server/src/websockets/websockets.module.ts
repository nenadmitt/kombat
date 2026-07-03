import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../authentication';
import { WebsocketsGateway } from './websockets.gateway';
import { WebsocketsService } from './websockets.service';

@Module({
  imports: [AuthenticationModule],
  providers: [WebsocketsGateway, WebsocketsService],
  exports: [WebsocketsService],
})
export class WebsocketsModule {}
