import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../authentication';
import { ChainModule } from '../chain';
import { WebsocketsModule } from '../websockets';
import { BattleshipDeadlineSweeper } from './battleships/battleship-deadline.sweeper';
import { BattleshipGateway } from './battleships/battleship.gateway';
import { BattleshipMatchService } from './battleships/battleship-match.service';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { StakeSweeper } from './stakes/stake.sweeper';
import { StakesService } from './stakes/stakes.service';

@Module({
  imports: [AuthenticationModule, WebsocketsModule, ChainModule],
  controllers: [GamesController],
  providers: [
    GamesService,
    StakesService,
    StakeSweeper,
    BattleshipMatchService,
    BattleshipGateway,
    BattleshipDeadlineSweeper,
  ],
})
export class GamesModule {}
