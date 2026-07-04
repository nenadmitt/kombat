import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../authentication';
import { WebsocketsModule } from '../websockets';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

@Module({
  imports: [AuthenticationModule, WebsocketsModule],
  controllers: [GamesController],
  providers: [GamesService],
})
export class GamesModule {}
