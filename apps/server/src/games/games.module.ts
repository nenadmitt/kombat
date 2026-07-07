import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../authentication';
import { WebsocketsModule } from '../websockets';
import { BattleshipGateway } from './battleships/battleship.gateway';
import { BattleshipMatchService } from './battleships/battleship-match.service';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

@Module({
  imports: [AuthenticationModule, WebsocketsModule],
  controllers: [GamesController],
  providers: [GamesService, BattleshipMatchService, BattleshipGateway],
})
export class GamesModule {}
